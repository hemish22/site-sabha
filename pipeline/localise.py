"""Sarvam Translate + Bulbul: turn briefing.json into per-language text and audio."""
import base64
import io
import wave

from .client import AUDIO, cached, get_client

LANG_NAMES = {
    "hi-IN": "Hindi", "bn-IN": "Bengali", "od-IN": "Odia", "ta-IN": "Tamil", "te-IN": "Telugu",
    "kn-IN": "Kannada", "ml-IN": "Malayalam", "mr-IN": "Marathi", "gu-IN": "Gujarati",
    "pa-IN": "Punjabi", "en-IN": "English",
}
TTS_SPEAKER = "shubh"
TTS_MAX_CHARS = 2000


def briefing_to_script(b: dict) -> list[str]:
    """Short English sentences for the spoken briefing, in reading order."""
    lines = [f"Safety briefing for {b.get('site') or 'today'}."]
    for h in b.get("hazards", []):
        control = h.get("control", "").rstrip(".")
        lines.append(f"Danger: {h['item'].rstrip('.')}. {control}." if control else f"Danger: {h['item'].rstrip('.')}.")
    if b.get("ppe"):
        lines.append("Wear this PPE: " + ", ".join(b["ppe"]) + ".")
    for t in b.get("tasks", []):
        lines.append(f"{t['crew']} crew: {t['task'].rstrip('.')}.")
    em = b.get("emergency") or {}
    if em.get("assembly_point"):
        lines.append(f"In an emergency, go to the assembly point: {em['assembly_point']}.")
    if em.get("contact"):
        lines.append(f"Emergency contact: {em['contact']}.")
    return lines


# mayura code-mixed keeps safety terms (harness, scaffold, fire extinguisher) in
# English the way site crews actually say them; sarvam-translate:v1 renders
# "harness" as e.g. Bengali "horse harness". Max 1000 chars, so translate per line.
TRANSLATE_MODEL = "mayura:v1"
TRANSLATE_MODE = "code-mixed"


def translate(text: str, target: str, source: str = "en-IN",
              model: str = TRANSLATE_MODEL, mode: str = TRANSLATE_MODE) -> str:
    if target == source:
        return text
    # Positional args so model/mode are part of the cache key.
    return _translate(text, target, source, model, mode)


@cached("translate")
def _translate(text: str, target: str, source: str, model: str, mode: str) -> str:
    r = get_client().text.translate(
        input=text, source_language_code=source, target_language_code=target,
        model=model, mode=mode,
    )
    return r.translated_text


def translate_lines(lines: list[str], target: str) -> list[str]:
    return [translate(l, target) for l in lines]


def _chunks(lines: list[str], limit: int = TTS_MAX_CHARS) -> list[str]:
    out, cur = [], ""
    for l in lines:
        if cur and len(cur) + len(l) + 1 > limit:
            out.append(cur)
            cur = ""
        cur = f"{cur} {l}".strip()
    if cur:
        out.append(cur)
    return out


@cached("tts")
def _tts(text: str, lang: str, speaker: str = TTS_SPEAKER, pace: float = 1.0) -> bytes:
    r = get_client().text_to_speech.convert(
        text=text, language_code=lang, model="bulbul:v3", speaker=speaker,
        output_audio_codec="wav", pace=pace,
    )
    return b"".join(base64.b64decode(a) for a in r.audios)


def _concat_wavs(parts: list[bytes]) -> bytes:
    if len(parts) == 1:
        return parts[0]
    buf = io.BytesIO()
    with wave.open(buf, "wb") as out:
        for i, p in enumerate(parts):
            with wave.open(io.BytesIO(p), "rb") as w:
                if i == 0:
                    out.setparams(w.getparams())
                out.writeframes(w.readframes(w.getnframes()))
    return buf.getvalue()


def speak(lines: list[str], lang: str, speaker: str = TTS_SPEAKER, pace: float = 1.0) -> bytes:
    return _concat_wavs([_tts(c, lang, speaker, pace) for c in _chunks(lines)])


def localise(briefing: dict, briefing_id: str, lang: str) -> dict:
    """Translate script + quiz into `lang`, synthesise audio, write audio/<id>_<lang>.wav."""
    script = briefing_to_script(briefing)
    lines = translate_lines(script, lang)
    quiz = [{**q, "q_local": translate(q["q"], lang)} for q in briefing.get("quiz", [])]
    path = AUDIO / f"{briefing_id}_{lang}.wav"
    if not path.exists():
        path.write_bytes(speak(lines, lang))
    quiz_audio = []
    for i, q in enumerate(quiz):
        qp = AUDIO / f"{briefing_id}_{lang}_q{i}.wav"
        if not qp.exists():
            qp.write_bytes(speak([q["q_local"]], lang))
        quiz_audio.append(str(qp))
    return {"lang": lang, "lines": lines, "script_en": script, "audio": str(path),
            "quiz": quiz, "quiz_audio": quiz_audio}
