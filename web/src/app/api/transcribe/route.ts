import { GLOSSARY } from "@/lib/config";
import { sarvam, withRetry } from "@/lib/sarvam";

export const maxDuration = 60;

/** One ≤30 s WAV chunk -> Saaras transcript. The browser does the chunking. */
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) return Response.json({ error: "Missing audio file" }, { status: 400 });
  const lang = (form.get("lang") as string) || undefined;
  const mode = ((form.get("mode") as string) || "codemix") as "codemix" | "transcribe";
  try {
    const data = Buffer.from(await file.arrayBuffer());
    const r = await withRetry(() =>
      sarvam().speechToText.transcribe({
        file: { data, filename: "audio.wav", contentType: "audio/wav" },
        model: "saaras:v4",
        mode,
        ...(lang ? { language_code: lang as never } : {}),
        keyterms: GLOSSARY,
      }),
    );
    return Response.json({ transcript: r.transcript, language_code: r.language_code ?? lang ?? null });
  } catch (e) {
    return Response.json({ error: `Saaras failed: ${String(e)}` }, { status: 502 });
  }
}
