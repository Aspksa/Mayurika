"""Regression checks for protocol framing and memory context separators."""
import ast
import unittest
from pathlib import Path


class FramingTests(unittest.TestCase):
    def test_post_handler_uses_newline_not_literal_backslash_n(self):
        source = (Path(__file__).resolve().parents[1] / "backend" / "main.py").read_text(encoding="utf-8")
        module = ast.parse(source)
        handler = next(node for node in module.body if isinstance(node, ast.ClassDef) and node.name == "Handler")
        post = next(node for node in handler.body if isinstance(node, ast.FunctionDef) and node.name == "do_POST")
        strings = [node.value for node in ast.walk(post)
                   if isinstance(node, ast.Constant) and isinstance(node.value, str)]
        self.assertNotIn(chr(92) + "n", strings, "Literal backslash-n breaks NDJSON framing")
        self.assertIn("\n", strings, "Streaming events need newline delimiters")
        self.assertTrue(any("\n" in value for value in strings),
                        "Memory context should separate instructions and facts")


if __name__ == "__main__":
    unittest.main()
