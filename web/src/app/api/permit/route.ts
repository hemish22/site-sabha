import { unzipSync, strFromU8 } from "fflate";
import { sarvam } from "@/lib/sarvam";

export const maxDuration = 60;

const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", pdf: "application/pdf" };

/** Start a Sarvam Vision digitise job for the permit photo. */
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Missing permit file" }, { status: 400 });
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  try {
    const job = await sarvam().docAi.digitise({
      file: [{ data: Buffer.from(await file.arrayBuffer()), filename: file.name, contentType: MIME[ext] ?? "image/jpeg" }],
      language: "en-IN",
      output_format: "md",
    });
    return Response.json({ jobId: job.job_id });
  } catch (e) {
    return Response.json({ error: `Sarvam Vision failed to start: ${String(e)}` }, { status: 502 });
  }
}

/** Poll a job; when finished, download the ZIP and return the Markdown text. */
export async function GET(req: Request) {
  const job = new URL(req.url).searchParams.get("job");
  if (!job) return Response.json({ error: "Missing job" }, { status: 400 });
  try {
    const st = await sarvam().docAi.getStatus(job);
    const status = st.status.toLowerCase();
    if (status === "failed" || status === "rejected") return Response.json({ status, error: `Permit reading ${status}` });
    if (status !== "completed" && status !== "partially_completed") return Response.json({ status });
    const dl = await sarvam().docAi.getDownloadUrl(job);
    const res = await fetch(dl.url, { method: dl.method || "GET", headers: dl.headers ?? {} });
    if (!res.ok) throw new Error(`download ${res.status}`);
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    const names = Object.keys(files)
      .filter((n) => /\.(md|html|txt)$/.test(n))
      .sort((a, b) => Number(!a.endsWith(".md")) - Number(!b.endsWith(".md")) || a.localeCompare(b));
    return Response.json({ status: "completed", text: names.map((n) => strFromU8(files[n])).join("\n\n") });
  } catch (e) {
    return Response.json({ error: `Sarvam Vision failed: ${String(e)}` }, { status: 502 });
  }
}
