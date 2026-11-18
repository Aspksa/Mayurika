import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"backend"))
import cloud

class Response:
    def __enter__(self): return self
    def __exit__(self,*args): return False
    def __iter__(self):
        return iter([b'data: {"choices":[{"delta":{"content":"Hello"}}]}\n',
                     b'data: {"choices":[{"delta":{"content":" world"}}]}\n',
                     b'data: [DONE]\n'])

class StreamTests(unittest.TestCase):
    @patch.dict(os.environ,{"MAYURIKA_CHAT_KEY":"dummy","MAYURIKA_CHAT_MODEL":"test"},clear=True)
    @patch("cloud.urllib.request.urlopen",return_value=Response())
    def test_stream(self, mock_urlopen):
        self.assertEqual("".join(cloud.stream_chat([{"role":"user","content":"Hi"}])),"Hello world")
        request=mock_urlopen.call_args.args[0]
        self.assertIn(b'"stream": true',request.data)
