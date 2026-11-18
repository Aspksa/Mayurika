"""Conservative, review-first memory extraction from explicit user statements.

No LLM calls, no automatic verification, no inferred personal attributes.
"""
import json
import re
from db import now, remember

PATTERNS = (
    re.compile(r"^\s*(?:запомни(?:,|:)?|remember(?: that)?[:,]?)\s+(.+)$", re.I),
    re.compile(r"^\s*(?:я предпочитаю|мне нравится|я использую|мой проект)\s+(.+)$", re.I),
)
SENSITIVE = re.compile(r"\b(?:парол[ья]|password|api[_ -]?key|токен|token|секрет|secret|"
                       r"паспорт|карт[аыу]|cvv|диагноз|болезн[ьи]|политическ|религи)\b", re.I)

def extract_candidates(message):
    """Return at most one explicit candidate; avoid guesses from general chat."""
    message = message.strip()
    if not 8 <= len(message) <= 500 or "\n" in message or SENSITIVE.search(message):
        return []
    for pattern in PATTERNS:
        match = pattern.match(message)
        if match:
            candidate = match.group(1).strip(" .")
            if len(candidate) >= 5 and not SENSITIVE.search(candidate):
                return [message]
    return []

def save_candidates(db, message, source_id):
    ids = []
    for candidate in extract_candidates(message):
        mid = remember(db, candidate, source_type="chat_message", source_id=str(source_id))
        ids.append(mid)
    return ids

def pending_memories(db, limit=100):
    rows = db.execute("""
        SELECT m.id,m.content,m.status,m.created_at,
               GROUP_CONCAT(s.source_type || ':' || s.source_id) AS sources
        FROM memories m LEFT JOIN memory_sources s ON s.memory_id=m.id
        WHERE m.status='pending'
        GROUP BY m.id ORDER BY m.id DESC LIMIT ?
    """, (min(max(int(limit),1),100),)).fetchall()
    return [dict(row) for row in rows]

def review_memory(db, memory_id, action):
    if action not in ("verified", "disputed", "archived"):
        raise ValueError("Invalid review action")
    with db:
        row = db.execute("SELECT content,status FROM memories WHERE id=?", (memory_id,)).fetchone()
        if row is None:
            raise ValueError("Memory not found")
        if row["status"] != "pending":
            raise ValueError("Memory already reviewed")
        db.execute("UPDATE memories SET status=?,updated_at=? WHERE id=?",
                   (action, now(), memory_id))
        db.execute("INSERT INTO memory_versions(memory_id,content,status,recorded_at) VALUES(?,?,?,?)",
                   (memory_id, row["content"], action, now()))
        db.execute("INSERT INTO activity_events(kind,payload,created_at) VALUES(?,?,?)",
                   ("memory_review", json.dumps({"id":memory_id,"status":action}), now()))
    return action
