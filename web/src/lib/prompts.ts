// Kept in sync with ../prompts/*.txt used by the Streamlit version.

export const STRUCTURE = `You are a construction site safety officer.
Inputs: (1) transcript of the supervisor's spoken briefing, (2) text of today's permit-to-work.
Output ONLY valid JSON with this schema:
{site, hazards:[{item, control, source:"briefing"|"permit"}], ppe:[], tasks:[{crew, task}],
 emergency:{assembly_point, contact}, quiz:[{q, expected_answer}]}
Rules:
- Use only facts present in the inputs. Do not add hazards.
- Write every field in simple English, even if the briefing is in Hindi or another language.
- One hazard entry per distinct hazard; merge duplicates from briefing and permit.
- source is "briefing" if the supervisor mentioned that hazard or its control in any language, otherwise "permit".
- Include permit-only hazards too, so workers hear the full picture.
- Keep each item under 15 words, in simple language.
- Generate 1-2 quiz questions on the highest-risk items the supervisor actually said (source "briefing" only).
  expected_answer must be a full short sentence, e.g. "Clipped to the lifeline at all times".
- Use "" for unknown strings and [] for unknown lists.
- Keep these terms in English: {glossary}.

=== BRIEFING TRANSCRIPT ===
{transcript}

=== PERMIT-TO-WORK TEXT ===
{permit}
`;

// Per-control checklist: asking only for "what is missing" let sarvam-105b
// return [] on ~20-50% of runs; forcing a verdict per permit control is stable.
export const GAP_CHECK = `You are a construction site safety auditor.
Go through the permit-to-work line by line. For EVERY hazard control, PPE item or procedure the permit requires, add one entry to "checks".
For each entry decide whether the supervisor's briefing transcript mentions that same control (in any language, including Hindi or code-mixed speech; judge by meaning).
- mentioned: true only if the transcript clearly says it. Put the words from the transcript in "evidence".
- mentioned: false if the transcript does not say it. Put "" in "evidence".
Mentioning the hazard (e.g. "welding") is NOT the same as mentioning its control (e.g. "fire extinguisher").
Write "control" in simple English. Copy "permit_line" from the permit.
severity: "high" for fire, fall, electrical, confined space or lifting controls; "med" for other PPE or procedure; "low" for paperwork.

=== PERMIT-TO-WORK TEXT ===
{permit}

=== BRIEFING TRANSCRIPT ===
{transcript}
`;

export const GRADE = `You are checking whether a construction worker understood a safety instruction.
Question: {q}
Expected answer: {expected_answer}
Worker's spoken answer (language: {lang}): {transcript}
Judge meaning only. Accept any language, code-mixing, or paraphrase.
- "understood": the answer contains the key safety point of the expected answer.
- "partial": related to the topic but vague, incomplete, or missing the key condition.
- "not_understood": wrong, unrelated, empty, or "I don't know".
Give "reason" as one short English sentence.
Output ONLY JSON: {verdict:"understood"|"partial"|"not_understood", reason}
`;

// Plain replace, not a template engine: the prompts contain literal JSON braces.
export function fill(template: string, vals: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vals)) out = out.split(`{${k}}`).join(v);
  return out;
}
