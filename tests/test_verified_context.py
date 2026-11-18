"""Verified memory grounding is strictly opt-in by review status."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from db import verified_context


class VerifiedContextTests(unittest.TestCase):
    def test_only_verified_memories_are_used(self):
        rows = [
            {"id": 1, "content": "unreviewed", "status": "pending"},
            {"id": 2, "content": "trusted", "status": "verified"},
            {"id": 3, "content": "contested", "status": "disputed"},
            {"id": 4, "content": "old", "status": "archived"},
            {"id": 5, "content": "second", "status": "verified"},
        ]
        context = verified_context(rows)
        self.assertEqual(context, "[Verified memory #2] trusted\n[Verified memory #5] second")
        for forbidden in ("unreviewed", "contested", "old"):
            self.assertNotIn(forbidden, context)

    def test_empty_when_nothing_verified(self):
        self.assertEqual(verified_context([{"id": 1, "content": "guess", "status": "pending"}]), "")


if __name__ == "__main__":
    unittest.main()
