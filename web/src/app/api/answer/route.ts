import { ROSTER } from "@/lib/config";
import { grade } from "@/lib/llm";
import { sarvam, withRetry } from "@/lib/sarvam";
import { addAck, getBriefing } from "@/lib/store";
import type { Verdict } from "@/lib/types";

export const maxDuration = 60;

/**
 * Worker's spoken answer -> Saaras (in the worker's language) -> 105B grade -> audit record.
 * Demo mode sends a precomputed result instead of audio; it is recorded the same way.
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const name = form.get("worker") as string;
  const briefingId = form.get("briefingId") as string;
  const worker = ROSTER.find((w) => w.name === name);
  const rec = briefingId ? await getBriefing(briefingId) : null;
  if (!worker || !rec) return Response.json({ error: "Unknown worker or briefing" }, { status: 400 });
  const q = rec.briefing.quiz[0];
  if (!q) return Response.json({ error: "This briefing has no question" }, { status: 400 });

  let transcript: string;
  let verdict: Verdict;
  let reason: string;
  const precomputed = form.get("precomputed");
  try {
    if (typeof precomputed === "string") {
      ({ transcript, verdict, reason } = JSON.parse(precomputed));
    } else {
      const file = form.get("file");
      if (!(file instanceof Blob)) return Response.json({ error: "Missing answer audio" }, { status: 400 });
      const data = Buffer.from(await file.arrayBuffer());
      const r = await withRetry(() =>
        sarvam().speechToText.transcribe({
          file: { data, filename: "answer.wav", contentType: "audio/wav" },
          model: "saaras:v4",
          mode: "transcribe",
          language_code: worker.language as never,
        }),
      );
      transcript = r.transcript;
      ({ verdict, reason } = await grade(q.q, q.expected_answer, transcript, worker.language));
    }
  } catch (e) {
    return Response.json({ error: `Checking the answer failed: ${String(e)}` }, { status: 502 });
  }
  await addAck({ worker: worker.name, language: worker.language, briefingId, event: "answer", question: q.q, transcript, verdict, reason });
  return Response.json({ question: q.q, transcript, verdict, reason });
}
