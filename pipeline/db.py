"""SQLite storage: briefings and per-worker acknowledgements."""
import csv
import io
import json
import sqlite3
from datetime import datetime

from .client import DATA, ROOT

DB_PATH = ROOT / "site_sabha.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS briefings (
  id TEXT PRIMARY KEY,
  date TEXT, site TEXT,
  transcript TEXT, permit_text TEXT,
  briefing_json TEXT, gap_flags_json TEXT, localised_json TEXT,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS acks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  worker_name TEXT, language TEXT, briefing_id TEXT,
  played_at TEXT, answered_at TEXT,
  question TEXT, answer_transcript TEXT,
  verdict TEXT, reason TEXT
);
"""

STATUS_ORDER = ["absent", "heard", "understood", "partial", "re-brief"]


def conn():
    c = sqlite3.connect(DB_PATH, check_same_thread=False)
    c.row_factory = sqlite3.Row
    c.executescript(SCHEMA)
    return c


def now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def load_roster() -> list[dict]:
    with open(DATA / "roster.csv", newline="") as f:
        return list(csv.DictReader(f))


def save_briefing(bid, briefing, gaps, transcript, permit_text, localised):
    with conn() as c:
        c.execute(
            "INSERT OR REPLACE INTO briefings VALUES (?,?,?,?,?,?,?,?,?)",
            (bid, briefing.get("date", ""), briefing.get("site", ""), transcript, permit_text,
             json.dumps(briefing, ensure_ascii=False), json.dumps(gaps, ensure_ascii=False),
             json.dumps(localised, ensure_ascii=False), now()),
        )


def _row_to_briefing(r):
    if not r:
        return None
    return {
        "id": r["id"], "date": r["date"], "site": r["site"], "transcript": r["transcript"],
        "permit_text": r["permit_text"], "briefing": json.loads(r["briefing_json"]),
        "gaps": json.loads(r["gap_flags_json"]), "localised": json.loads(r["localised_json"]),
        "created_at": r["created_at"],
    }


def latest_briefing():
    with conn() as c:
        return _row_to_briefing(c.execute("SELECT * FROM briefings ORDER BY created_at DESC LIMIT 1").fetchone())


def record_play(worker, lang, bid):
    with conn() as c:
        row = c.execute("SELECT id FROM acks WHERE worker_name=? AND briefing_id=? AND verdict IS NULL",
                        (worker, bid)).fetchone()
        if row:
            c.execute("UPDATE acks SET played_at=? WHERE id=?", (now(), row["id"]))
        else:
            c.execute("INSERT INTO acks (worker_name, language, briefing_id, played_at) VALUES (?,?,?,?)",
                      (worker, lang, bid, now()))


def record_answer(worker, lang, bid, question, transcript, verdict, reason):
    with conn() as c:
        row = c.execute("SELECT id FROM acks WHERE worker_name=? AND briefing_id=? AND verdict IS NULL",
                        (worker, bid)).fetchone()
        if row:
            c.execute("UPDATE acks SET answered_at=?, question=?, answer_transcript=?, verdict=?, reason=? WHERE id=?",
                      (now(), question, transcript, verdict, reason, row["id"]))
        else:
            c.execute("INSERT INTO acks (worker_name, language, briefing_id, played_at, answered_at, question, "
                      "answer_transcript, verdict, reason) VALUES (?,?,?,?,?,?,?,?,?)",
                      (worker, lang, bid, now(), now(), question, transcript, verdict, reason))


def rebrief(worker, bid):
    """Open a fresh attempt: the old graded row stays in the audit log."""
    with conn() as c:
        c.execute("INSERT INTO acks (worker_name, language, briefing_id, reason) "
                  "SELECT worker_name, language, briefing_id, 'Re-brief requested by supervisor' "
                  "FROM acks WHERE worker_name=? AND briefing_id=? "
                  "ORDER BY id DESC LIMIT 1", (worker, bid))


def _status(row) -> str:
    if row is None:
        return "absent"
    v = row["verdict"]
    if v == "understood":
        return "understood"
    if v == "partial":
        return "partial"
    if v == "not_understood":
        return "re-brief"
    if row["played_at"]:
        return "heard"
    return "re-brief" if row["reason"] else "absent"


def status_grid(bid, roster=None) -> list[dict]:
    roster = roster or load_roster()
    with conn() as c:
        out = []
        for w in roster:
            row = c.execute("SELECT * FROM acks WHERE worker_name=? AND briefing_id=? ORDER BY id DESC LIMIT 1",
                            (w["name"], bid)).fetchone()
            out.append({
                "worker": w["name"], "language": w["language_code"], "status": _status(row),
                "answer": row["answer_transcript"] if row else "", "reason": row["reason"] if row else "",
                "updated": (row["answered_at"] or row["played_at"]) if row else "",
            })
        return out


def export_csv(bid) -> str:
    with conn() as c:
        rows = c.execute("SELECT worker_name, language, briefing_id, played_at, answered_at, question, "
                         "answer_transcript, verdict, reason FROM acks WHERE briefing_id=? ORDER BY id",
                         (bid,)).fetchall()
    grid = {g["worker"]: g for g in status_grid(bid)}
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["worker_name", "language", "briefing_id", "played_at", "answered_at", "question",
                "answer_transcript", "verdict", "reason"])
    seen = set()
    for r in rows:
        w.writerow(list(r))
        seen.add(r["worker_name"])
    for name, g in grid.items():
        if name not in seen:
            w.writerow([name, g["language"], bid, "", "", "", "", "absent", ""])
    return buf.getvalue()
