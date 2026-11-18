"""Conversation history stored transactionally in the existing SQLite database."""
import json
import uuid
from db import now

def create_conversation(db,title):
    cid=str(uuid.uuid4())
    with db:
        db.execute("INSERT INTO conversations(id,title,created_at) VALUES(?,?,?)",(cid,title[:100],now()))
    return cid

def conversations(db):
    return [dict(r) for r in db.execute("""
        SELECT c.id,c.title,c.created_at,COUNT(m.id) AS message_count
        FROM conversations c LEFT JOIN messages m ON m.conversation_id=c.id
        GROUP BY c.id ORDER BY c.created_at DESC LIMIT 100
    """)]

def history(db,cid,limit=30):
    if not db.execute("SELECT 1 FROM conversations WHERE id=?",(cid,)).fetchone():
        raise ValueError("Conversation not found")
    rows=db.execute("""
        SELECT role,content,created_at FROM (
          SELECT id,role,content,created_at FROM messages
          WHERE conversation_id=? ORDER BY id DESC LIMIT ?
        ) ORDER BY id
    """,(cid,limit)).fetchall()
    return [dict(r) for r in rows]

def save_exchange(db,cid,user_text,assistant_text):
    with db:
        if not db.execute("SELECT 1 FROM conversations WHERE id=?",(cid,)).fetchone():
            raise ValueError("Conversation not found")
        db.execute("INSERT INTO messages(conversation_id,role,content,created_at) VALUES(?,?,?,?)",
                   (cid,"user",user_text,now()))
        db.execute("INSERT INTO messages(conversation_id,role,content,created_at) VALUES(?,?,?,?)",
                   (cid,"assistant",assistant_text,now()))
        db.execute("INSERT INTO activity_events(kind,payload,created_at) VALUES(?,?,?)",
                   ("chat_exchange",json.dumps({"conversation_id":cid}),now()))
