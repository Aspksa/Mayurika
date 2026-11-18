"""SQLite storage: one database, versioned facts, deduplication and durable events."""
import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

def now():
    return datetime.now(timezone.utc).isoformat()

def connect(path):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(str(path), timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA busy_timeout=5000")
    return db

def migrate(db):
    db.executescript("""
    CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL REFERENCES conversations(id),
      role TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
      content TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_hash TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending','verified','disputed','archived')),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memory_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      memory_id INTEGER NOT NULL REFERENCES memories(id),
      source_type TEXT NOT NULL, source_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(memory_id,source_type,source_id)
    );
    CREATE TABLE IF NOT EXISTS memory_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      memory_id INTEGER NOT NULL REFERENCES memories(id),
      content TEXT NOT NULL, status TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memory_relations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
      target_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
      relation TEXT NOT NULL CHECK(relation IN ('related','possible_conflict')),
      score REAL NOT NULL CHECK(score >= 0 AND score <= 1),
      status TEXT NOT NULL DEFAULT 'suggested'
        CHECK(status IN ('suggested','accepted','rejected')),
      created_at TEXT NOT NULL,
      UNIQUE(source_id,target_id,relation),
      CHECK(source_id < target_id)
    );
    CREATE INDEX IF NOT EXISTS idx_relations_target ON memory_relations(target_id);
    CREATE TABLE IF NOT EXISTS activity_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS background_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_key TEXT NOT NULL UNIQUE, kind TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      payload TEXT NOT NULL DEFAULT '{}',
      attempts INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_memory_status ON memories(status);
    CREATE INDEX IF NOT EXISTS idx_events_time ON activity_events(id);
    """)
    try:
        db.execute("CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(content, content='memories', content_rowid='id')")
        db.executescript("""
        CREATE TRIGGER IF NOT EXISTS memory_ai AFTER INSERT ON memories BEGIN
          INSERT INTO memory_fts(rowid,content) VALUES(new.id,new.content);
        END;
        CREATE TRIGGER IF NOT EXISTS memory_ad AFTER DELETE ON memories BEGIN
          INSERT INTO memory_fts(memory_fts,rowid,content) VALUES('delete',old.id,old.content);
        END;
        CREATE TRIGGER IF NOT EXISTS memory_au AFTER UPDATE OF content ON memories BEGIN
          INSERT INTO memory_fts(memory_fts,rowid,content) VALUES('delete',old.id,old.content);
          INSERT INTO memory_fts(rowid,content) VALUES(new.id,new.content);
        END;
        """)
    except sqlite3.OperationalError:
        pass
    db.commit()

def remember(db, content, source_type="manual", source_id="user"):
    normalized=" ".join(content.strip().split())
    if not normalized:
        raise ValueError("Empty memory")
    key=hashlib.sha256(normalized.casefold().encode("utf-8")).hexdigest()
    with db:
        db.execute("INSERT OR IGNORE INTO memories(canonical_hash,content,created_at,updated_at) VALUES(?,?,?,?)",(key,normalized,now(),now()))
        record=db.execute("SELECT id FROM memories WHERE canonical_hash=?",(key,)).fetchone()
        memory_id=record["id"]
        db.execute("INSERT OR IGNORE INTO memory_sources(memory_id,source_type,source_id,created_at) VALUES(?,?,?,?)",(memory_id,source_type,source_id,now()))
        db.execute("INSERT INTO activity_events(kind,payload,created_at) VALUES(?,?,?)",("memory_seen",json.dumps({"id":memory_id}),now()))
    return memory_id

def search(db, query, limit=10):
    limit=max(1,min(int(limit),30))
    try:
        # Quote user input as a literal phrase: no raw FTS operators.
        phrase='"'+query.replace('"','""')+'"'
        rows=db.execute("""SELECT m.id,m.content,m.status FROM memory_fts f
            JOIN memories m ON m.id=f.rowid
            WHERE memory_fts MATCH ? AND m.status!='archived'
            ORDER BY bm25(memory_fts) LIMIT ?""",(phrase,limit)).fetchall()
        if rows:
            return [dict(r) for r in rows]
    except sqlite3.OperationalError:
        pass
    escaped=query.replace("%","\\%").replace("_","\\_")
    rows=db.execute("""SELECT id,content,status FROM memories
        WHERE content LIKE ? ESCAPE '\\' AND status!='archived'
        ORDER BY id DESC LIMIT ?""",("%"+escaped+"%",limit)).fetchall()
    return [dict(r) for r in rows]


def verified_context(rows):
    """Format reviewed memories for LLM context; never include pending or disputed records."""
    return "\n".join(
        "[Verified memory #" + str(row["id"]) + "] " + row["content"]
        for row in rows if row["status"] == "verified"
    )
