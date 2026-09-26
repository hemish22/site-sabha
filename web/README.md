# Site Sabha: web app

Next.js 16 (App Router, TypeScript, Tailwind v4) version of Site Sabha, deployed on Vercel:
**https://site-sabha.vercel.app**

The browser orchestrates the pipeline as short API calls so each serverless function stays well under Vercel's limits:

| Route | Does |
|---|---|
| `POST /api/transcribe` | One ≤30 s WAV chunk → Saaras (`saaras:v4`). The browser decodes and chunks audio (no ffmpeg on Vercel). |
| `POST /api/permit`, `GET /api/permit?job=` | Start / poll a Sarvam Vision digitise job, return the permit as Markdown |
| `POST /api/structure` | Sarvam-105B: briefing.json + permit gap check (per-control checklist, 3 runs, majority vote) |
| `POST /api/localise` | One language: Mayura code-mixed translation + Bulbul `bulbul:v3` mp3, stored in Vercel Blob |
| `POST /api/answer` | Worker's spoken answer → Saaras in their language → 105B grade → audit record |
| `GET/POST /api/briefings`, `/api/acks`, `GET /api/export` | Briefing records, heard / re-brief events, tag board grid, audit CSV |

Storage is Vercel Blob (write-once JSON records and audio). **Demo data** (header toggle) replays the fixtures in `public/demo`, exported from the Python cache by `../scripts/export_demo.py`.

## Run locally
```bash
npm install
vercel link && vercel env pull .env.local   # BLOB_READ_WRITE_TOKEN
echo "SARVAM_API_KEY=your-key" >> .env.local
npm run dev
```

## Environment variables
| Name | Where |
|---|---|
| `SARVAM_API_KEY` | Sarvam dashboard; add to the Vercel project (Production) |
| `BLOB_READ_WRITE_TOKEN` | Added automatically when the Blob store is connected |
