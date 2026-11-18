"""Foundation smoke tests; standard-library only."""
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"backend"))
from db import connect,migrate,remember,search

class StorageTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.db=connect(Path(self.temp.name)/"test.sqlite3")
        migrate(self.db)
    def tearDown(self):
        self.db.close()
        self.temp.cleanup()
    def test_dedup(self):
        a=remember(self.db,"Hello   world",source_id="a")
        b=remember(self.db,"hello world",source_id="b")
        self.assertEqual(a,b)
        self.assertEqual(self.db.execute("SELECT count(*) FROM memories").fetchone()[0],1)
        self.assertEqual(self.db.execute("SELECT count(*) FROM memory_sources").fetchone()[0],2)
    def test_search(self):
        remember(self.db,"SQLite stores memory")
        self.assertEqual(len(search(self.db,"SQLite")),1)
    def test_pending(self):
        id=remember(self.db,"Unverified note")
        row=self.db.execute("SELECT status FROM memories WHERE id=?",(id,)).fetchone()
        self.assertEqual(row["status"],"pending")
    def test_persistence(self):
        remember(self.db,"Persistent memory")
        self.db.close()
        self.db=connect(Path(self.temp.name)/"test.sqlite3")
        self.assertEqual(self.db.execute("SELECT count(*) FROM memories").fetchone()[0],1)

if __name__=="__main__":
    unittest.main()
