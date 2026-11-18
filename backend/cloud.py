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

def configuration(require_model=True):
    endpoint=os.environ.get("MAYURIKA_CHAT_URL","https://foundation-models.api.cloud.ru/v1/chat/completions").strip()
    model=os.environ.get("MAYURIKA_CHAT_MODEL","").strip()
    key=os.environ.get("MAYURIKA_CHAT_KEY","").strip()
    if not key or (require_model and not model):
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

def list_models():
    """Return model identifiers using the provider's documented GET /v1/models."""
    endpoint, _model, key = configuration(require_model=False)
    parsed = urllib.parse.urlsplit(endpoint)
    if not parsed.path.endswith("/chat/completions"):
        raise CloudError("Model discovery requires a /chat/completions endpoint")
    models_url = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc,
        parsed.path[:-len("/chat/completions")] + "/models", "", ""))
    req = urllib.request.Request(models_url, headers={
        "Authorization": "Bearer " + key, "User-Agent": "Mayurika/0.2"
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            raw = response.read(2_000_001)
            if len(raw) > 2_000_000:
                raise CloudError("Model list too large")
    except urllib.error.HTTPError as exc:
        raise CloudError("Cloud HTTP error " + str(exc.code)) from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise CloudError("Cloud connection failed or timed out") from None
    try:
        payload = json.loads(raw)
        return sorted({m["id"] for m in payload["data"]
                       if isinstance(m, dict) and isinstance(m.get("id"), str)})[:500]
    except (ValueError, KeyError, TypeError):
        raise CloudError("Unexpected model list response") from None

def stream_chat(messages):
    """Yield OpenAI-compatible SSE delta text; no secrets in errors."""
    endpoint, model, key = configuration()
    payload = json.dumps({"model": model, "messages": messages, "stream": True},
                         ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(endpoint, data=payload, headers={
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
        "Authorization": "Bearer " + key,
        "User-Agent": "Mayurika/0.3",
    }, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=90) as response:
            total = 0
            for raw in response:
                if len(raw) > 100_000:
                    raise CloudError("Cloud stream frame too large")
                line = raw.decode("utf-8").strip()
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    return
                if not data:
                    continue
                try:
                    packet = json.loads(data)
                    delta = packet["choices"][0].get("delta", {}).get("content")
                except (ValueError, KeyError, IndexError, TypeError):
                    raise CloudError("Invalid cloud stream event") from None
                if isinstance(delta, str) and delta:
                    total += len(delta)
                    if total > 50000:
                        raise CloudError("Cloud response too long")
                    yield delta
    except urllib.error.HTTPError as exc:
        raise CloudError("Cloud HTTP error " + str(exc.code)) from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise CloudError("Cloud connection failed or timed out") from None
