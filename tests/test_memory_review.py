import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"backend"))
from db import connect,migrate
from chat_store import create_conversation,save_exchange
from memory_review import extract_candidates,pending_memories,review_memory

class MemoryReviewTests(unittest.TestCase):
    def test_conservative_extraction(self):
        self.assertEqual(extract_candidates("Привет, как дела?"),[])
        self.assertEqual(extract_candidates("Запомни: я использую SQLite"),["Запомни: я использую SQLite"])
        self.assertEqual(extract_candidates("Запомни мой password 123456"),[])
    def test_review_and_provenance(self):
        with tempfile.TemporaryDirectory() as tmp:
            with connect(Path(tmp)/"test.sqlite3") as db:
                migrate(db)
                cid=create_conversation(db,"test")
                save_exchange(db,cid,"Запомни: мой проект Mayurika","Хорошо")
                rows=pending_memories(db)
                self.assertEqual(len(rows),1)
                self.assertIn("chat_message:",rows[0]["sources"])
                mid=rows[0]["id"]
                self.assertEqual(review_memory(db,mid,"verified"),"verified")
                self.assertEqual(len(pending_memories(db)),0)
                self.assertEqual(db.execute("SELECT COUNT(*) FROM memory_versions").fetchone()[0],1)
                with self.assertRaises(ValueError):
                    review_memory(db,mid,"archived")
    def test_regular_chat_not_saved_as_fact(self):
        with tempfile.TemporaryDirectory() as tmp:
            with connect(Path(tmp)/"test.sqlite3") as db:
                migrate(db)
                cid=create_conversation(db,"test")
                save_exchange(db,cid,"Что нового?","Ничего")
                self.assertEqual(len(pending_memories(db)),0)
