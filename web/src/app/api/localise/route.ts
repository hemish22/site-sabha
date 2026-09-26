import { localise } from "@/lib/localise";

export const maxDuration = 300;

/** One language: Mayura translation + Bulbul audio, uploaded to Blob. */
export async function POST(req: Request) {
  const { briefingId, briefing, lang } = await req.json();
  if (!briefingId || !briefing || !lang) return Response.json({ error: "Missing briefingId, briefing or lang" }, { status: 400 });
  try {
    return Response.json(await localise(briefing, briefingId, lang));
  } catch (e) {
    return Response.json({ error: `Localising ${lang} failed: ${String(e)}` }, { status: 502 });
  }
}
