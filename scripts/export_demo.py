"""Export the cached sample run as static fixtures for the Next.js app's demo mode.

Writes web/public/demo/{briefing.json, answers.json, audio/*.mp3} and copies the
sample assets to web/public/samples/. Runs entirely from data/cache (DEMO_MODE=1).
Run scripts/smoke.py once online first if the cache is cold.
"""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

os.environ["DEMO_MODE"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline import db  # noqa: E402
from pipeline.client import DATA, ROOT  # noqa: E402
from pipeline.run import check_answer, run_briefing  # noqa: E402

WEB = ROOT / "web" / "public"
DEMO, SAMPLES = WEB / "demo", WEB / "samples"
(DEMO / "audio").mkdir(parents=True, exist_ok=True)
(SAMPLES / "answers").mkdir(parents=True, exist_ok=True)


def to_mp3(src: str, name: str) -> str:
    out = DEMO / "audio" / name
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-b:a", "64k", str(out)], check=True)
    return f"/demo/audio/{name}"


res = run_briefing((DATA / "sample_briefing.wav").read_bytes(), (DATA / "sample_permit.jpg").read_bytes(), log=lambda *_: None)
localised = {}
for lang, loc in res["localised"].items():
    localised[lang] = {
        "lang": lang,
        "lines": loc["lines"],
        "scriptEn": loc["script_en"],
        "audioUrl": to_mp3(loc["audio"], f"{lang}.mp3"),
        "quiz": [
            {"q": q["q"], "expected_answer": q["expected_answer"], "q_local": q["q_local"],
             "audioUrl": to_mp3(loc["quiz_audio"][i], f"{lang}_q{i}.mp3")}
            for i, q in enumerate(loc["quiz"])
        ],
    }
record = {
    "id": "demo", "createdAt": "", "transcript": res["transcript"], "permitText": res["permit_text"],
    "briefing": res["briefing"], "gaps": res["gaps"], "localised": localised, "demo": True,
}
(DEMO / "briefing.json").write_text(json.dumps(record, ensure_ascii=False, indent=1))

roster = {w["name"]: w for w in db.load_roster()}
answers = {}
for key, name in [("ta_correct", "Ravi"), ("bn_vague", "Sumon"), ("od_wrong", "Bikash")]:
    r = check_answer(res["briefing"], roster[name], (DATA / "answers" / f"{key}.wav").read_bytes())
    answers[key] = {"transcript": r["transcript"], "verdict": r["verdict"], "reason": r["reason"]}
(DEMO / "answers.json").write_text(json.dumps(answers, ensure_ascii=False, indent=1))

for f in ["sample_briefing.wav", "noisy_briefing.wav", "sample_permit.jpg"]:
    shutil.copy(DATA / f, SAMPLES / f)
for f in (DATA / "answers").glob("*.wav"):
    shutil.copy(f, SAMPLES / "answers" / f.name)
print("exported", sorted(p.name for p in DEMO.rglob("*") if p.is_file()))
