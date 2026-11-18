import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"backend"))
from db import connect,migrate,remember
from memory_relations import propose_relations,relation_list,review_relation

class RelationsTests(unittest.TestCase):
    def test_related_and_review(self):
        with tempfile.TemporaryDirectory() as tmp:
            with connect(Path(tmp)/"memory.sqlite3") as db:
                migrate(db)
                first=remember(db,"проект Mayurika использует SQLite память")
                second=remember(db,"проект Mayurika использует SQLite базу")
                suggestions=propose_relations(db,second)
                self.assertEqual(len(suggestions),1)
                self.assertEqual(suggestions[0]["relation"],"related")
                rows=relation_list(db)
                self.assertEqual(len(rows),1)
                self.assertEqual(review_relation(db,rows[0]["id"],"accepted"),"accepted")
                with self.assertRaises(ValueError):
                    review_relation(db,rows[0]["id"],"rejected")
    def test_low_overlap_not_linked(self):
        with tempfile.TemporaryDirectory() as tmp:
            with connect(Path(tmp)/"memory.sqlite3") as db:
                migrate(db)
                remember(db,"красивые горы далеко")
                second=remember(db,"Python использует облачные модели")
                self.assertEqual(propose_relations(db,second),[])
