"""Sarvam Vision (Document Intelligence): permit photo -> markdown text.

The job is async, so start() returns a Future right away; the app kicks it off
on upload and collects the result after Saaras finishes.
"""
import io
import time
import zipfile
from concurrent.futures import Future, ThreadPoolExecutor

import requests

from .client import cached, get_client

_pool = ThreadPoolExecutor(max_workers=2)
TERMINAL = {"completed", "partially_completed", "failed", "rejected"}
MIME = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "pdf": "application/pdf"}


def _extract_text(zip_bytes: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
        names = [n for n in z.namelist() if n.endswith((".md", ".html", ".txt"))]
        names.sort(key=lambda n: (not n.endswith(".md"), n))
        return "\n\n".join(z.read(n).decode("utf-8", "replace") for n in names)


@cached("vision")
def digitise(image: bytes, filename: str = "permit.jpg", timeout_s: int = 240) -> str:
    client = get_client()
    ext = filename.rsplit(".", 1)[-1].lower()
    job = client.doc_ai.digitise(
        file=[(filename, image, MIME.get(ext, "image/jpeg"))],
        language="en-IN", output_format="md",
    )
    deadline = time.time() + timeout_s
    while True:
        st = client.doc_ai.get_status(job.job_id)
        status = st.status.lower()
        if status in TERMINAL:
            break
        if time.time() > deadline:
            raise TimeoutError(f"Vision job {job.job_id} still {status} after {timeout_s}s")
        time.sleep(3)
    if status not in ("completed", "partially_completed"):
        raise RuntimeError(f"Vision job {job.job_id} ended as {status}")
    dl = client.doc_ai.get_download_url(job.job_id)
    resp = requests.request(dl.method or "GET", dl.url, headers=dl.headers or {}, timeout=60)
    resp.raise_for_status()
    return _extract_text(resp.content)


def start(image: bytes, filename: str = "permit.jpg") -> Future:
    return _pool.submit(digitise, image, filename)
