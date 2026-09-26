import "server-only";
import { GLOSSARY, langName } from "./config";
import { fill, GAP_CHECK, GRADE, STRUCTURE } from "./prompts";
import { chatJson } from "./sarvam";
import type { Briefing, Gap, Verdict } from "./types";

const STR = { type: "string" };

const obj = (props: Record<string, object>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(props),
  properties: props,
});

const BRIEFING_SCHEMA = obj({
  site: STR,
  hazards: { type: "array", items: obj({ item: STR, control: STR, source: { type: "string", enum: ["briefing", "permit"] } }) },
  ppe: { type: "array", items: STR },
  tasks: { type: "array", items: obj({ crew: STR, task: STR }) },
  emergency: obj({ assembly_point: STR, contact: STR }),
  quiz: { type: "array", items: obj({ q: STR, expected_answer: STR }) },
});

const CHECKS_SCHEMA = obj({
  checks: {
    type: "array",
    items: obj({
      control: STR,
      permit_line: STR,
      mentioned: { type: "boolean" },
      evidence: STR,
      severity: { type: "string", enum: ["high", "med", "low"] },
    }),
  },
});

interface Check {
  control: string;
  permit_line: string;
  mentioned: boolean;
  evidence: string;
  severity: Gap["severity"];
}

const GRADE_SCHEMA = obj({
  verdict: { type: "string", enum: ["understood", "partial", "not_understood"] },
  reason: STR,
});

export async function structure(transcript: string, permitText: string): Promise<Briefing> {
  const out = await chatJson<Briefing>(
    fill(STRUCTURE, { transcript, permit: permitText || "(no permit provided)", glossary: GLOSSARY.join(", ") }),
    "briefing",
    BRIEFING_SCHEMA,
  );
  out.hazards = (out.hazards ?? []).filter((h) => h.source === "briefing" || h.source === "permit");
  out.date = new Date().toISOString().slice(0, 10);
  return out;
}

const GAP_RUNS = 3;

// "Fire extinguisher (CO2 / DCP) within 5 m." -> "fire extinguisher"
const gapKey = (g: Gap) =>
  g.missing.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean).slice(0, 2).join(" ");

/**
 * Each run checks every permit control against the transcript; the unmentioned
 * ones are gaps. Runs vary slightly, so three run in parallel and a gap is kept
 * when a majority agree, merged by its leading words (which also folds OCR
 * duplicates like "Fire extinguisher (SCB)").
 */
export async function gapCheck(permitText: string, transcript: string): Promise<Gap[]> {
  if (!permitText.trim()) return [];
  const prompt = fill(GAP_CHECK, { permit: permitText, transcript });
  const runs = await Promise.allSettled(
    Array.from({ length: GAP_RUNS }, () => chatJson<{ checks: Check[] }>(prompt, "checks", CHECKS_SCHEMA)),
  );
  const lists: Gap[][] = runs
    .filter((r): r is PromiseFulfilledResult<{ checks: Check[] }> => r.status === "fulfilled")
    .map((r) =>
      (r.value.checks ?? [])
        .filter((c) => !c.mentioned)
        .map((c) => ({ missing: c.control, permit_line: c.permit_line, severity: c.severity })),
    );
  if (!lists.length) throw new Error("Gap check failed on every attempt");

  const votes = new Map<string, { gap: Gap; runs: number }>();
  for (const list of lists) {
    const seen = new Set<string>();
    for (const g of list) {
      const k = gapKey(g);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      const v = votes.get(k);
      if (v) v.runs++;
      else votes.set(k, { gap: g, runs: 1 });
    }
  }
  const need = Math.floor(lists.length / 2) + 1;
  const rank = { high: 0, med: 1, low: 2 };
  return [...votes.values()]
    .filter((v) => v.runs >= need)
    .map((v) => v.gap)
    .sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export async function grade(q: string, expected: string, transcript: string, lang: string) {
  if (!transcript.trim()) return { verdict: "not_understood" as Verdict, reason: "No answer was heard." };
  return chatJson<{ verdict: Verdict; reason: string }>(
    fill(GRADE, { q, expected_answer: expected, transcript, lang: langName(lang) }),
    "grade",
    GRADE_SCHEMA,
  );
}
