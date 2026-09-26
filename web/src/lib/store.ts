import "server-only";
import { list, put } from "@vercel/blob";
import { ROSTER } from "./config";
import type { AckEvent, BriefingRecord, GridRow, WorkerStatus } from "./types";

// Records live in Vercel Blob. Every write goes to a new pathname and nothing
// is overwritten, so CDN caching of blob URLs can never serve stale data and
// fetched JSON can be memoised by URL.

const jsonCache = new Map<string, unknown>();

export async function putFile(pathname: string, body: Buffer | string, contentType: string): Promise<string> {
  const r = await put(pathname, body, { access: "public", contentType, addRandomSuffix: true });
  return r.url;
}

async function putJson(pathname: string, data: unknown) {
  await put(pathname, JSON.stringify(data), { access: "public", contentType: "application/json", addRandomSuffix: true });
}

async function readJson<T>(url: string): Promise<T> {
  if (jsonCache.has(url)) return jsonCache.get(url) as T;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`blob read failed ${res.status}: ${url}`);
  const data = await res.json();
  jsonCache.set(url, data);
  return data as T;
}

async function listAll(prefix: string) {
  const blobs: { url: string; pathname: string }[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs;
}

// Sortable key: zero-padded epoch ms, newest last.
const stamp = () => String(Date.now()).padStart(15, "0");

export async function saveBriefing(rec: BriefingRecord) {
  await putJson(`briefings/${stamp()}_${rec.id}.json`, rec);
}

export async function latestBriefing(): Promise<BriefingRecord | null> {
  const blobs = await listAll("briefings/");
  if (!blobs.length) return null;
  blobs.sort((a, b) => a.pathname.localeCompare(b.pathname));
  return readJson<BriefingRecord>(blobs[blobs.length - 1].url);
}

export async function getBriefing(id: string): Promise<BriefingRecord | null> {
  const blobs = await listAll("briefings/");
  const hit = blobs.find((b) => b.pathname.includes(`_${id}`));
  return hit ? readJson<BriefingRecord>(hit.url) : null;
}

export async function addAck(ev: Omit<AckEvent, "at">): Promise<AckEvent> {
  const full: AckEvent = { ...ev, at: new Date().toISOString() };
  const safe = ev.worker.replace(/[^\w-]/g, "");
  await putJson(`acks/${ev.briefingId}/${stamp()}_${safe}_${ev.event}.json`, full);
  return full;
}

export async function listAcks(briefingId: string): Promise<AckEvent[]> {
  const blobs = await listAll(`acks/${briefingId}/`);
  blobs.sort((a, b) => a.pathname.localeCompare(b.pathname));
  return Promise.all(blobs.map((b) => readJson<AckEvent>(b.url)));
}

function statusOf(ev: AckEvent | undefined): WorkerStatus {
  if (!ev) return "absent";
  if (ev.event === "rebrief") return "re-brief";
  if (ev.event === "heard") return "heard";
  return ev.verdict === "understood" ? "understood" : ev.verdict === "partial" ? "partial" : "re-brief";
}

export function statusGrid(acks: AckEvent[]): GridRow[] {
  return ROSTER.map((w) => {
    const mine = acks.filter((a) => a.worker === w.name);
    const last = mine[mine.length - 1];
    // A re-listen after a re-brief request counts as "heard", but a plain
    // re-listen after a graded answer shouldn't hide the grade.
    const lastAnswer = [...mine].reverse().find((a) => a.event === "answer");
    const lastRebrief = [...mine].reverse().find((a) => a.event === "rebrief");
    let effective = last;
    if (last?.event === "heard" && lastAnswer && (!lastRebrief || lastRebrief.at < lastAnswer.at)) effective = lastAnswer;
    return {
      worker: w.name,
      language: w.language,
      status: statusOf(effective),
      answer: lastAnswer?.transcript ?? "",
      reason: effective?.event === "rebrief" ? "Re-brief requested by supervisor" : (lastAnswer?.reason ?? ""),
      updated: last?.at ?? "",
    };
  });
}

export function auditCsv(briefingId: string, acks: AckEvent[]): string {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["worker_name", "language", "briefing_id", "event", "at", "question", "answer_transcript", "verdict", "reason"];
  const rows = acks.map((a) => [a.worker, a.language, a.briefingId, a.event, a.at, a.question, a.transcript, a.verdict, a.reason]);
  const seen = new Set(acks.map((a) => a.worker));
  for (const w of ROSTER) if (!seen.has(w.name)) rows.push([w.name, w.language, briefingId, "absent", "", "", "", "", ""]);
  return [header, ...rows].map((r) => r.map(esc).join(",")).join("\n") + "\n";
}
