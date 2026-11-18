import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"backend"))
from db import connect,migrate
from chat_store import create_conversation,history,save_exchange,conversations

class ChatStorageTests(unittest.TestCase):
    def test_history_and_atomic_exchange(self):
        with tempfile.TemporaryDirectory() as folder:
            with connect(Path(folder)/"db.sqlite3") as db:
                migrate(db)
                cid=create_conversation(db,"Test")
                save_exchange(db,cid,"Hello","Hello, хозяин")
                self.assertEqual([x["role"] for x in history(db,cid)],["user","assistant"])
                self.assertEqual(conversations(db)[0]["message_count"],2)
                with self.assertRaises(ValueError):
                    save_exchange(db,"missing","x","y")
                self.assertEqual(len(history(db,cid)),2)
