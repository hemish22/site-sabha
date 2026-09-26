"""End-to-end briefing pipeline shared by the app and scripts/smoke.py."""
import json
from datetime import date

from . import db, llm, localise, stt, vision
from .client import DATA, _digest


def load_glossary() -> list[str]:
    return json.loads((DATA / "glossary.json").read_text())


def run_briefing(audio: bytes, permit: bytes | None, permit_name: str = "permit.jpg",
                 langs: list[str] | None = None, log=print) -> dict:
    glossary = load_glossary()
    langs = langs or sorted({w["language_code"] for w in db.load_roster()})
    bid = f"{date.today().isoformat()}-{_digest([audio, permit or b''])[:8]}"

    # Vision is async and slow: start it before Saaras and collect it afterwards.
    permit_job = vision.start(permit, permit_name) if permit else None
    log("Saaras: transcribing briefing")
    tr = stt.transcribe(audio, mode="codemix", keyterms=glossary)
    transcript = tr["transcript"]
    log(f"Saaras: {len(transcript)} chars, language {tr['language_code']}")

    permit_text = ""
    if permit_job:
        log("Sarvam Vision: reading permit")
        permit_text = permit_job.result()
        log(f"Sarvam Vision: {len(permit_text)} chars")

    log("Sarvam-105B: structuring briefing")
    briefing = llm.structure(transcript, permit_text, glossary)
    briefing["date"] = date.today().isoformat()
    log("Sarvam-105B: permit gap check")
    gaps = llm.gap_check(permit_text, transcript)
    log(f"Sarvam-105B: {len(gaps)} gap(s) flagged")

    localised = {}
    for lang in langs:
        log(f"Translate + Bulbul: {localise.LANG_NAMES.get(lang, lang)}")
        localised[lang] = localise.localise(briefing, bid, lang)

    db.save_briefing(bid, briefing, gaps, transcript, permit_text, localised)
    log(f"Saved briefing {bid}")
    return {"id": bid, "briefing": briefing, "gaps": gaps, "transcript": transcript,
            "permit_text": permit_text, "localised": localised}


def check_answer(briefing: dict, worker: dict, answer_audio: bytes, q_index: int = 0) -> dict:
    """Transcribe a worker's spoken answer and grade it."""
    lang = worker["language_code"]
    q = briefing["quiz"][q_index]
    tr = stt.transcribe(answer_audio, lang=lang, mode="transcribe")
    g = llm.grade(q["q"], q["expected_answer"], tr["transcript"], localise.LANG_NAMES.get(lang, lang))
    return {"question": q["q"], "transcript": tr["transcript"], **g}
