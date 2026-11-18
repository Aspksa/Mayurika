"""Optional OpenAI-compatible chat transport, stdlib only.

Provider compatibility must be verified using the configured endpoint.
Never persist the API key in SQLite or logs.
"""
import json
import os
import urllib.error
import urllib.parse
import urllib.request

class CloudError(Exception):
    pass

def configuration():
    endpoint=os.environ.get("MAYURIKA_CHAT_URL","").strip()
    model=os.environ.get("MAYURIKA_CHAT_MODEL","").strip()
    key=os.environ.get("MAYURIKA_CHAT_KEY","").strip()
    if not (endpoint and model and key):
        raise CloudError("Set MAYURIKA_CHAT_URL, MAYURIKA_CHAT_MODEL and MAYURIKA_CHAT_KEY")
    parsed=urllib.parse.urlsplit(endpoint)
    if parsed.scheme!="https" or not parsed.hostname or parsed.username or parsed.password or parsed.fragment:
        raise CloudError("Cloud endpoint must be an HTTPS URL")
    return endpoint,model,key

def chat(messages):
    endpoint,model,key=configuration()
    payload=json.dumps({"model":model,"messages":messages,"stream":False},ensure_ascii=False).encode("utf-8")
    req=urllib.request.Request(endpoint,data=payload,headers={
        "Content-Type":"application/json",
        "Authorization":"Bearer "+key,
        "User-Agent":"Mayurika/0.2"
    },method="POST")
    try:
        with urllib.request.urlopen(req,timeout=65) as response:
            raw=response.read(2_000_001)
            if len(raw)>2_000_000:
                raise CloudError("Cloud response too large")
    except urllib.error.HTTPError as exc:
        raise CloudError("Cloud HTTP error "+str(exc.code)) from None
    except (urllib.error.URLError,TimeoutError,OSError):
        raise CloudError("Cloud connection failed or timed out") from None
    try:
        result=json.loads(raw)
        answer=result["choices"][0]["message"]["content"]
        if not isinstance(answer,str) or not answer.strip():
            raise ValueError()
        return answer[:50000]
    except (KeyError,IndexError,TypeError,ValueError,json.JSONDecodeError):
        raise CloudError("Unexpected cloud response format") from None
