import { gapCheck, structure } from "@/lib/llm";

export const maxDuration = 60;

/** Transcript + permit text -> briefing.json and permit gap flags (two 105B calls in parallel). */
export async function POST(req: Request) {
  const { transcript, permitText = "" } = await req.json();
  if (!transcript) return Response.json({ error: "Missing transcript" }, { status: 400 });
  try {
    const [briefing, gaps] = await Promise.all([structure(transcript, permitText), gapCheck(permitText, transcript)]);
    return Response.json({ briefing, gaps });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
