import io
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"backend"))
import cloud

class FakeResponse:
    def __enter__(self): return self
    def __exit__(self,*args): return False
    def read(self,n): return b'{"data":[{"id":"ai-sage/test"},{"id":"z/test"}]}'

class CloudTests(unittest.TestCase):
    @patch.dict(os.environ,{"MAYURIKA_CHAT_KEY":"dummy","MAYURIKA_CHAT_MODEL":"ai-sage/test"},clear=True)
    def test_official_default_endpoint(self):
        endpoint,model,key=cloud.configuration()
        self.assertEqual(endpoint,"https://foundation-models.api.cloud.ru/v1/chat/completions")
        self.assertEqual(model,"ai-sage/test")
    @patch.dict(os.environ,{"MAYURIKA_CHAT_KEY":"dummy"},clear=True)
    @patch("cloud.urllib.request.urlopen",return_value=FakeResponse())
    def test_model_list(self,urlopen):
        self.assertEqual(cloud.list_models(),["ai-sage/test","z/test"])
        request=urlopen.call_args.args[0]
        self.assertEqual(request.full_url,"https://foundation-models.api.cloud.ru/v1/models")
    @patch.dict(os.environ,{"MAYURIKA_CHAT_KEY":"dummy","MAYURIKA_CHAT_MODEL":"x","MAYURIKA_CHAT_URL":"http://example.com"},clear=True)
    def test_reject_http(self):
        with self.assertRaises(cloud.CloudError):cloud.configuration()
