"""Deterministic, reviewable suggestions for memory links; not truth verification."""
import json
import re
from db import now

WORD = re.compile(r"[^\W_]{3,}", re.UNICODE)
NEGATIONS = {"не", "нет", "никогда", "без", "not", "never", "no"}
STOP = {"это", "что", "как", "для", "мой", "моя", "мои", "the", "and", "with",
        "запомни", "меня", "есть", "будет", "который", "использую"}

def tokens(content):
    return {w for w in WORD.findall(content.casefold()) if w not in STOP}

def propose_relations(db, memory_id, limit=200):
    source=db.execute("SELECT id,content FROM memories WHERE id=? AND status!='archived'",
                      (memory_id,)).fetchone()
    if source is None:
        return []
    a=tokens(source["content"])
    if len(a)<2:
        return []
    candidates=db.execute("""SELECT id,content FROM memories
        WHERE id!=? AND status!='archived' ORDER BY id DESC LIMIT ?""",
        (memory_id,min(max(int(limit),1),500))).fetchall()
    suggestions=[]
    for row in candidates:
        b=tokens(row["content"])
        overlap=len(a & b)
        if overlap<2:
            continue
        score=overlap/len(a|b)
        if score<0.3:
            continue
        # A differing negation is only a signal for human review, never proof.
        neg_a=bool(set(source["content"].casefold().split()) & NEGATIONS)
        neg_b=bool(set(row["content"].casefold().split()) & NEGATIONS)
        kind="possible_conflict" if neg_a!=neg_b else "related"
        low,high=sorted((memory_id,row["id"]))
        with db:
            db.execute("""INSERT OR IGNORE INTO memory_relations
                (source_id,target_id,relation,score,created_at)
                VALUES(?,?,?,?,?)""",(low,high,kind,round(score,4),now()))
        suggestions.append({"source_id":low,"target_id":high,"relation":kind,"score":round(score,4)})
    return suggestions

def relation_list(db, limit=100):
    rows=db.execute("""SELECT r.id,r.source_id,r.target_id,r.relation,r.score,r.status,
        a.content AS source_content,b.content AS target_content
        FROM memory_relations r JOIN memories a ON a.id=r.source_id
        JOIN memories b ON b.id=r.target_id
        WHERE a.status!='archived' AND b.status!='archived'
        ORDER BY r.id DESC LIMIT ?""",(min(max(int(limit),1),200),)).fetchall()
    return [dict(row) for row in rows]

def review_relation(db, relation_id, action):
    if action not in ("accepted","rejected"):
        raise ValueError("Invalid relation action")
    with db:
        row=db.execute("SELECT status FROM memory_relations WHERE id=?",(relation_id,)).fetchone()
        if row is None or row["status"]!="suggested":
            raise ValueError("Relation not found or already reviewed")
        db.execute("UPDATE memory_relations SET status=? WHERE id=?",(action,relation_id))
        db.execute("INSERT INTO activity_events(kind,payload,created_at) VALUES(?,?,?)",
                   ("relation_review",json.dumps({"id":relation_id,"status":action}),now()))
    return action
