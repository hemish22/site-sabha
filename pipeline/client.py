"""Shared Sarvam client, paths, and a disk cache that doubles as demo mode.

Every network call to Sarvam goes through a function wrapped in @cached.
Results are keyed by a hash of the inputs and stored under data/cache/.
With DEMO_MODE=1 the cache is the only source: a miss raises CacheMiss
instead of hitting the network.
"""
import functools
import hashlib
import json
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CACHE = DATA / "cache"
AUDIO = ROOT / "audio"
PROMPTS = ROOT / "prompts"

load_dotenv(ROOT / ".env")
CACHE.mkdir(parents=True, exist_ok=True)
AUDIO.mkdir(parents=True, exist_ok=True)


class CacheMiss(RuntimeError):
    pass


def demo_mode() -> bool:
    return os.environ.get("DEMO_MODE", "0") == "1"


_client = None


def get_client():
    global _client
    if _client is None:
        from sarvamai import SarvamAI

        key = os.environ.get("SARVAM_API_KEY", "")
        if not key:
            try:  # Streamlit Community Cloud secrets
                import streamlit as st

                key = st.secrets.get("SARVAM_API_KEY", "")
            except Exception:
                pass
        if not key or key == "your-key-here":
            raise RuntimeError("SARVAM_API_KEY missing: set it in .env or Streamlit secrets")
        _client = SarvamAI(api_subscription_key=key, timeout=120)
    return _client


def _digest(obj) -> str:
    h = hashlib.sha256()

    def feed(o):
        if isinstance(o, (bytes, bytearray)):
            h.update(b"B")
            h.update(hashlib.sha256(o).digest())
        elif isinstance(o, dict):
            h.update(b"D")
            for k in sorted(o):
                feed(k)
                feed(o[k])
        elif isinstance(o, (list, tuple)):
            h.update(b"L")
            for x in o:
                feed(x)
        else:
            h.update(repr(o).encode())

    feed(obj)
    return h.hexdigest()[:24]


def cached(kind: str):
    """Cache a function's JSON-able or bytes result on disk, keyed by its args."""

    def deco(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            key = _digest([kind, args, kwargs])
            jpath = CACHE / f"{kind}_{key}.json"
            bpath = CACHE / f"{kind}_{key}.bin"
            if jpath.exists():
                return json.loads(jpath.read_text())
            if bpath.exists():
                return bpath.read_bytes()
            if demo_mode():
                raise CacheMiss(f"demo mode: no cached {kind} result for these inputs")
            out = fn(*args, **kwargs)
            if isinstance(out, (bytes, bytearray)):
                bpath.write_bytes(out)
            else:
                jpath.write_text(json.dumps(out, ensure_ascii=False, indent=1))
            return out

        return wrapper

    return deco
