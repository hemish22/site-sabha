"""Headless end-to-end check on the sample assets. Also warms the cache for demo mode.

Usage: python scripts/smoke.py        (DEMO_MODE=1 to verify cache-only replay)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline import db  # noqa: E402
from pipeline.client import DATA  # noqa: E402
from pipeline.run import check_answer, run_briefing  # noqa: E402

fails = []


def check(cond, msg):
    print(("  PASS " if cond else "  FAIL ") + msg)
    if not cond:
        fails.append(msg)


res = run_briefing((DATA / "sample_briefing.wav").read_bytes(), (DATA / "sample_permit.jpg").read_bytes())
b, gaps = res["briefing"], res["gaps"]
print("\ntranscript:", res["transcript"][:300], "…")
print("hazards:", *[f"  [{h['source']}] {h['item']} -> {h['control']}" for h in b["hazards"]], sep="\n")
print("quiz:", b["quiz"])
print("gaps:", *[f"  [{g['severity']}] {g['missing']}" for g in gaps], sep="\n")

check(len(res["transcript"]) > 100, "transcript is non-trivial")
check(b["hazards"] and all(h["source"] in ("briefing", "permit") for h in b["hazards"]), "hazards have sources")
check(len(b["quiz"]) >= 1, "at least one quiz question")
check(any("extinguisher" in (g["missing"] + g["permit_line"]).lower() for g in gaps), "extinguisher gap flagged")
for lang, loc in res["localised"].items():
    size = Path(loc["audio"]).stat().st_size
    check(size > 10_000, f"{lang} audio {size} bytes")

roster = {w["name"]: w for w in db.load_roster()}
cases = [("Ravi", "ta_correct.wav", "understood"), ("Sumon", "bn_vague.wav", "partial"),
         ("Bikash", "od_wrong.wav", "not_understood")]
for name, f, want in cases:
    r = check_answer(b, roster[name], (DATA / "answers" / f).read_bytes())
    print(f"\n{name}: heard {r['transcript']!r} -> {r['verdict']} ({r['reason']})")
    db.record_answer(name, roster[name]["language_code"], res["id"], r["question"], r["transcript"],
                     r["verdict"], r["reason"])
    check(r["verdict"] == want, f"{name} graded {want}")

print("\n" + db.export_csv(res["id"]))
print("FAILED:" if fails else "ALL PASS", *fails, sep="\n  ")
sys.exit(1 if fails else 0)
