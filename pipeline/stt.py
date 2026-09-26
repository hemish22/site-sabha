"""Saaras speech-to-text. Splits audio longer than the 30 s REST limit."""
import subprocess
import tempfile
from pathlib import Path

from .client import cached, get_client

MAX_SECONDS = 28
CHUNK_SECONDS = 25


def _to_wav(audio: bytes, out: Path) -> float:
    """Normalise any input to 16 kHz mono wav; return duration in seconds."""
    src = out.with_suffix(".in")
    src.write_bytes(audio)
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-ac", "1", "-ar", "16000", str(out)],
        check=True,
    )
    dur = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(out)],
        check=True, capture_output=True, text=True,
    ).stdout.strip()
    return float(dur or 0)


@cached("stt_chunk")
def _transcribe_chunk(wav: bytes, lang: str | None, mode: str, keyterms: tuple) -> dict:
    kwargs = dict(file=("audio.wav", wav, "audio/wav"), model="saaras:v4", mode=mode)
    if lang:
        kwargs["language_code"] = lang
    if keyterms:
        kwargs["keyterms"] = list(keyterms)
    r = get_client().speech_to_text.transcribe(**kwargs)
    return {"transcript": r.transcript, "language_code": r.language_code}


def transcribe(audio: bytes, lang: str | None = None, mode: str = "codemix",
               keyterms: list[str] | None = None) -> dict:
    """Return {"transcript", "language_code"} for audio of any length."""
    kt = tuple(keyterms or ())
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        wav_path = td / "full.wav"
        dur = _to_wav(audio, wav_path)
        if dur <= MAX_SECONDS:
            return _transcribe_chunk(wav_path.read_bytes(), lang, mode, kt)
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav_path), "-f", "segment",
             "-segment_time", str(CHUNK_SECONDS), "-c", "copy", str(td / "part%03d.wav")],
            check=True,
        )
        parts = [_transcribe_chunk(p.read_bytes(), lang, mode, kt) for p in sorted(td.glob("part*.wav"))]
    return {
        "transcript": " ".join(p["transcript"].strip() for p in parts if p["transcript"]),
        "language_code": parts[0]["language_code"] if parts else lang,
    }
