import { getBriefing, latestBriefing, saveBriefing } from "@/lib/store";
import type { BriefingRecord } from "@/lib/types";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  const rec = id ? await getBriefing(id) : await latestBriefing();
  return Response.json(rec);
}

export async function POST(req: Request) {
  const rec = (await req.json()) as BriefingRecord;
  if (!rec?.id || !rec.briefing) return Response.json({ error: "Invalid briefing record" }, { status: 400 });
  await saveBriefing(rec);
  return Response.json({ ok: true, id: rec.id });
}
