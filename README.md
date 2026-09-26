# Site Sabha

One safety briefing, every worker's language, with proof that each worker understood it.
Built on Sarvam AI: Saaras · Sarvam Vision · Sarvam-105B · Sarvam Translate (mayura) · Bulbul.
Full spec: [SITE_SABHA.md](SITE_SABHA.md).

## Run locally
```bash
python -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env   # add SARVAM_API_KEY
.venv/bin/python scripts/make_assets.py   # sample permit, briefing, worker answers
.venv/bin/python scripts/smoke.py         # end-to-end check, warms data/cache
.venv/bin/streamlit run app.py
```
Needs `ffmpeg` on PATH.

## Deploy (Streamlit Community Cloud)
Main file `app.py`. Add secret `SARVAM_API_KEY = "..."`. `packages.txt` installs ffmpeg.
`data/cache` is committed, so the sample flow and **Demo mode** (sidebar) run without API calls.

## Pages
- **Supervisor**: briefing audio + permit photo → hazards, permit gap flags, audio per language
- **Worker** (`/worker?worker=Ravi`): listen, answer by voice, graded understood / partial / re-brief
- **Dashboard**: live roster status grid, re-brief, audit CSV export
