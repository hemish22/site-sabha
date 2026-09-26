# Site Sabha

**One safety briefing, every worker's language, with proof that each worker understood it.**

Built on Sarvam AI: Saaras · Sarvam Vision · Sarvam-105B · Sarvam Translate · Bulbul

---

## 1. Problem

Construction and factory crews in India are largely migrant workers who speak Odia, Bengali, Hindi, Tamil, Telugu and other languages. The morning safety briefing (toolbox talk) is usually given once, in one language. Workers who don't follow that language miss hazard warnings, PPE instructions and emergency procedures. The only record is a signature on an attendance sheet. That signature proves the worker was there, not that they understood anything.

## 2. Solution

The supervisor speaks the briefing once and photographs the day's permit-to-work sheet. Site Sabha then does four things:

1. **Structures** the briefing into hazards, PPE, crew tasks and emergency info.
2. **Checks for gaps**: it flags hazards listed on the permit that the supervisor did not mention.
3. **Localises**: each worker gets an audio version of the briefing in their own language.
4. **Verifies understanding**: each worker answers one question by voice in their own language. The answer is graded as *understood*, *partial* or *re-brief*.

The supervisor gets a live dashboard and an exportable audit log.

## 3. Key differentiators

| Feature | Why it matters |
|---|---|
| Permit gap check | Catches the supervisor's omissions before work starts |
| Voice comprehension check | Replaces "samajh gaya" with evidence that the worker understood |
| Per-worker language | Every worker hears the briefing in their own language, not the supervisor's |
| Source-tagged items | Every checklist item traces back to the briefing or the permit, so nothing is made up |
| Audit log | Gives the safety officer a compliance record that means something |

## 4. Sarvam product map

| Step | Product | Model / call |
|---|---|---|
| Supervisor briefing → text | **Saaras** | `saaras:v4`, `mode="transcribe"` or `"codemix"` |
| Permit-to-work photo → text | **Sarvam Vision** | `client.doc_ai.digitise(...)` (async, `output_format="json"`) |
| Structuring, gap check, quiz generation, answer grading | **Sarvam-105B** | `sarvam-105b` via `client.chat.completions` |
| Checklist → worker languages | **Sarvam Translate** | `client.text.translate(...)` |
| Audio briefing per language | **Bulbul** | `bulbul:v3` (hi, bn, od, ta, te, kn, ml, mr, gu, pa, en) |
| Worker's spoken answer → text | **Saaras** | `saaras:v4` |

SDK: `pip install sarvamai`. Auth header: `api-subscription-key`. Base URL: `https://api.sarvam.ai`.

## 5. Architecture

```
SUPERVISOR
  [voice briefing]            [permit photo]
        │                           │
     Saaras                  Sarvam Vision (async)
        │                           │
        └──────────┬────────────────┘
                   ▼
            Sarvam-105B
   ├─ briefing.json  (hazards, PPE, tasks, emergency, quiz)
   └─ gap_flags      (in permit, missing from briefing)
                   │
                   ▼
   for each language in roster:
       Sarvam Translate → Bulbul → audio/<lang>.mp3  (cached)
                   │
                   ▼
WORKER VIEW (per worker, via QR / link)
   play audio → answer quiz by voice → Saaras → 105B grade
                   │
                   ▼
SUPERVISOR DASHBOARD
   roster × status grid (heard / understood / partial / re-brief / absent)
   re-brief button · CSV audit export
```

## 6. Tech stack

- **App:** Streamlit (uses `st.audio_input` for mic recording)
- **Storage:** SQLite (`site_sabha.db`) plus `roster.csv`
- **Audio:** Bulbul returns base64. Decode it once and cache as mp3 per language.
- **Language:** Python 3.10+

## 7. Repo structure

```
site-sabha/
├── app.py                 # Streamlit entry: supervisor + worker + dashboard pages
├── pipeline/
│   ├── stt.py             # Saaras wrappers
│   ├── vision.py          # Sarvam Vision digitise + poll
│   ├── llm.py             # 105B prompts: structure, gap check, grade
│   ├── localise.py        # Translate + Bulbul, mp3 caching
│   └── db.py              # SQLite: briefings, acknowledgements
├── prompts/
│   ├── structure.txt
│   ├── gap_check.txt
│   └── grade.txt
├── data/
│   ├── roster.csv         # name, language_code, phone
│   ├── glossary.json      # safety terms kept as English loanwords
│   ├── sample_briefing.wav
│   └── sample_permit.jpg
├── audio/                 # generated mp3s
├── .env                   # SARVAM_API_KEY
└── requirements.txt       # sarvamai, streamlit, python-dotenv
```

### Sample `roster.csv`
```csv
name,language_code,phone
Ravi,ta-IN,9xxxxxxxx1
Bikash,od-IN,9xxxxxxxx2
Sumon,bn-IN,9xxxxxxxx3
Ramesh,hi-IN,9xxxxxxxx4
```

### Sample `glossary.json`
```json
["harness", "scaffolding", "PPE", "helmet", "fire extinguisher", "permit", "assembly point", "lockout"]
```

## 8. Data schemas

### `briefing.json` (output of 105B)
```json
{
  "date": "2026-09-26",
  "site": "Block C",
  "hazards": [
    {"item": "Work at height on scaffold", "control": "Full-body harness, clipped at all times", "source": "briefing"},
    {"item": "Hot work near scaffold", "control": "Fire extinguisher within 5 m", "source": "permit"}
  ],
  "ppe": ["helmet", "harness", "safety shoes", "gloves"],
  "tasks": [{"crew": "Shuttering", "task": "Level 3 slab formwork"}],
  "emergency": {"assembly_point": "Main gate", "contact": "Site safety officer"},
  "quiz": [{"q": "When must the harness be clipped?", "expected_answer": "At all times when working on the scaffold"}]
}
```

### `gap_flags`
```json
[{"missing": "Fire extinguisher for hot work", "permit_line": "Hot work: welding near scaffold, Level 3", "severity": "high"}]
```

### Acknowledgement record (SQLite)
| field | type |
|---|---|
| worker_name | text |
| language | text |
| briefing_id | text |
| played_at | timestamp |
| answer_transcript | text |
| verdict | understood / partial / not_understood |
| reason | text |

## 9. Sarvam-105B prompts

### 9.1 Structure the briefing
```
You are a construction site safety officer.
Inputs: (1) transcript of the supervisor's spoken briefing, (2) text of today's permit-to-work.
Output ONLY valid JSON with this schema:
{hazards:[{item, control, source:"briefing"|"permit"}], ppe:[], tasks:[{crew, task}],
 emergency:{assembly_point, contact}, quiz:[{q, expected_answer}]}
Rules:
- Use only facts present in the inputs. Do not add hazards.
- Keep each item under 15 words, in simple language.
- Generate 1–2 quiz questions on the highest-risk items.
- Keep these terms in English: {glossary}.
```

### 9.2 Gap check
```
Compare the permit text with the briefing transcript.
List every hazard or control present in the permit but NOT mentioned in the briefing.
Output ONLY JSON: [{missing, permit_line, severity:"high"|"med"|"low"}]
Return [] if nothing is missing.
```

### 9.3 Grade a worker's answer
```
Question: {q}
Expected answer: {expected_answer}
Worker's spoken answer (language: {lang}): {transcript}
Judge meaning only. Accept any language, code-mixing, or paraphrase.
Output ONLY JSON: {verdict:"understood"|"partial"|"not_understood", reason}
```

## 10. Build timeline (6 hours)

| Time | Build | Done when |
|---|---|---|
| 0:00–0:30 | API key, env, sample assets: 60-sec Hindi/Tamil briefing, mock permit (print and photograph it), 8-worker roster across 4 languages | Assets in `/data` |
| 0:30–1:30 | Saaras → 105B → `briefing.json` | Valid JSON from 2 different recordings |
| 1:30–2:30 | Translate + Bulbul per language, cache mp3s | 4 playable clips |
| 2:30–3:30 | Vision permit parse → 105B gap check | Planted gap gets flagged |
| 3:30–4:30 | Worker view: play → record answer → Saaras → grade | All 3 verdict types show up correctly |
| 4:30–5:15 | Supervisor dashboard: status grid, re-brief button, CSV export | Grid updates live |
| 5:15–6:00 | Noisy-audio test, backup recordings, demo rehearsal | Full run takes under 3 min |

### If you only get 1–2 hours
Build Saaras → 105B → Translate → Bulbul for 3 languages, plus one graded answer. Run the Vision gap check on a pre-processed, cached result.

## 11. Demo script (3 minutes)

1. **Problem (20 s):** "Half the crew doesn't speak the supervisor's language. The attendance signature proves nothing."
2. **Briefing (30 s):** The supervisor speaks a 40-sec briefing in Hindi and uploads the permit photo.
3. **Gap flag (20 s):** The checklist appears with a red flag: *"Permit mentions hot work, briefing missed fire extinguisher."*
4. **Localise (30 s):** Play the Tamil and Odia clips.
5. **Verify (40 s):** Worker A answers correctly in Tamil and gets ✅ understood. Worker B gives a vague answer in Bengali and gets ⚠ re-brief.
6. **Dashboard (30 s):** 6/8 understood, 1 re-brief, 1 absent. Export the audit CSV.
7. **Close (10 s):** "Five Sarvam models, one briefing, every worker covered."

## 12. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Vision is async, so it's slow | Start the job as soon as the photo is uploaded and poll it while Saaras runs. Keep a cached result as a fallback. |
| Safety terms mistranslated | Keep a glossary of English loanwords and pass it to 105B and the translation step |
| 105B invents hazards | Required `source` field, "use only facts in the inputs" rule, and the source tag shown in the UI |
| Noisy site audio | Record demo audio somewhere quiet, and keep one noisy clip to show it still works |
| Bulbul base64 latency | Decode once and cache mp3 per language. Never regenerate on play. |
| API failure mid-demo | Pre-generate all outputs for the demo run and toggle "demo mode" from cache |

## 13. Team split

| Member | Owns |
|---|---|
| A | Saaras, 105B prompts, JSON schema (`stt.py`, `llm.py`) |
| B | Translate, Bulbul, worker view (`localise.py`, worker page) |
| C | Vision gap check, dashboard, SQLite (`vision.py`, `db.py`, dashboard page) |

## 14. Future scope

- Outbound IVR calls for workers without smartphones (Bulbul audio over phone, Saaras for the answer)
- WhatsApp delivery of the audio briefing and quiz
- Incident-to-briefing loop: yesterday's near-miss report is automatically added to today's briefing
- Weekly analytics: which hazards are most often misunderstood, and by which crew
- Integration with site ERP and permit-to-work systems

## 15. References

- Sarvam docs: https://docs.sarvam.ai
- Quickstart: https://docs.sarvam.ai/api/getting-started/quickstart.md
- Models: https://docs.sarvam.ai/api/getting-started/models
