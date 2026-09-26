"use client";
import { useEffect, useState } from "react";
import { AudioButton } from "@/components/AudioButton";
import { Recorder } from "@/components/Recorder";
import { type Step, Steps } from "@/components/Steps";
import { decodeToMono16k, durationOf, encodeWav, splitChunks } from "@/lib/audio";
import { api, fetchBlob, pool, postForm, postJson, sleep, useDemo } from "@/lib/client";
import { LANG_NATIVE, langName, ROSTER, ROSTER_LANGS } from "@/lib/config";
import type { Briefing, BriefingRecord, Gap, Localised } from "@/lib/types";

type AudioSrc = "sample" | "noisy" | "record" | "upload";
type PermitSrc = "sample" | "upload" | "none";

const AUDIO_OPTS: { id: AudioSrc; label: string }[] = [
  { id: "sample", label: "Sample briefing" },
  { id: "noisy", label: "Sample, noisy site" },
  { id: "record", label: "Record" },
  { id: "upload", label: "Upload" },
];
const PERMIT_OPTS: { id: PermitSrc; label: string }[] = [
  { id: "sample", label: "Sample permit" },
  { id: "upload", label: "Upload photo" },
  { id: "none", label: "No permit" },
];

export default function BriefPage() {
  const demo = useDemo();
  const [audioSrc, setAudioSrc] = useState<AudioSrc>("sample");
  const [recorded, setRecorded] = useState<Blob | null>(null);
  const [uploaded, setUploaded] = useState<File | null>(null);
  const [permitSrc, setPermitSrc] = useState<PermitSrc>("sample");
  const [permitFile, setPermitFile] = useState<File | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [record, setRecord] = useState<BriefingRecord | null>(null);

  useEffect(() => {
    api<BriefingRecord | null>("/api/briefings").then(setRecord).catch(() => {});
  }, []);

  const audioReady =
    audioSrc === "sample" || audioSrc === "noisy" || (audioSrc === "record" ? !!recorded : !!uploaded);

  const step = (id: string, patch: Partial<Step>) =>
    setSteps((all) => all.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  async function getAudio(): Promise<Blob> {
    if (audioSrc === "sample") return fetchBlob("/samples/sample_briefing.wav");
    if (audioSrc === "noisy") return fetchBlob("/samples/noisy_briefing.wav");
    return (audioSrc === "record" ? recorded : uploaded)!;
  }

  async function getPermit(): Promise<File | null> {
    if (permitSrc === "none") return null;
    if (permitSrc === "upload") return permitFile;
    return new File([await fetchBlob("/samples/sample_permit.jpg")], "sample_permit.jpg", { type: "image/jpeg" });
  }

  async function run() {
    setError("");
    setRunning(true);
    const hasPermit = permitSrc !== "none";
    setSteps([
      { id: "stt", label: "Transcribing the briefing", state: "waiting" },
      ...(hasPermit ? [{ id: "permit", label: "Reading the permit", state: "waiting" as const }] : []),
      { id: "llm", label: "Building the checklist and checking permit gaps", state: "waiting" },
      ...ROSTER_LANGS.map((l) => ({ id: l, label: `${langName(l)} audio`, state: "waiting" as const })),
      { id: "save", label: "Sharing with the crew", state: "waiting" },
    ]);
    try {
      const rec = demo ? await runDemo(hasPermit) : await runLive(hasPermit);
      step("save", { state: "running" });
      await postJson("/api/briefings", rec);
      step("save", { state: "done" });
      setRecord(rec);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSteps((all) => all.map((s) => (s.state === "running" ? { ...s, state: "error" } : s)));
    } finally {
      setRunning(false);
    }
  }

  async function runDemo(hasPermit: boolean): Promise<BriefingRecord> {
    const fixture = await api<BriefingRecord>("/demo/briefing.json");
    for (const s of ["stt", ...(hasPermit ? ["permit"] : []), "llm", ...ROSTER_LANGS]) {
      step(s, { state: "running" });
      await sleep(350);
      step(s, { state: "done", detail: "from demo data" });
    }
    return {
      ...fixture,
      id: `demo-${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
      gaps: hasPermit ? fixture.gaps : [],
      permitText: hasPermit ? fixture.permitText : "",
    };
  }

  async function runLive(hasPermit: boolean): Promise<BriefingRecord> {
    const [audio, permit] = await Promise.all([getAudio(), getPermit()]);
    if (hasPermit && !permit) throw new Error("Choose a permit photo, or pick No permit.");

    // Sarvam Vision is the slowest step, so it starts first and runs alongside Saaras.
    let permitJob: Promise<string> = Promise.resolve("");
    if (permit) {
      step("permit", { state: "running" });
      permitJob = (async () => {
        const { jobId } = await postForm<{ jobId: string }>("/api/permit", { file: [permit, permit.name] });
        const deadline = Date.now() + 4 * 60_000;
        while (Date.now() < deadline) {
          await sleep(3000);
          const r = await api<{ status: string; text?: string }>(`/api/permit?job=${encodeURIComponent(jobId)}`);
          if (r.text !== undefined) return r.text;
        }
        throw new Error("Reading the permit took over 4 minutes. Try again, or run without a permit.");
      })();
      permitJob.then(
        (t) => step("permit", { state: "done", detail: `${t.length} characters` }),
        () => step("permit", { state: "error" }),
      );
    }

    step("stt", { state: "running" });
    const samples = await decodeToMono16k(audio);
    const chunks = splitChunks(samples);
    step("stt", { detail: `${Math.round(durationOf(samples))} s in ${chunks.length} part${chunks.length > 1 ? "s" : ""}` });
    const parts = await Promise.all(
      chunks.map((c) => postForm<{ transcript: string }>("/api/transcribe", { file: [encodeWav(c), "chunk.wav"], mode: "codemix" })),
    );
    const transcript = parts.map((p) => p.transcript.trim()).filter(Boolean).join(" ");
    if (!transcript) throw new Error("No speech was heard in the briefing audio. Check the recording and try again.");
    step("stt", { state: "done", detail: `${transcript.length} characters` });

    const permitText = await permitJob;
    step("llm", { state: "running" });
    const { briefing, gaps } = await postJson<{ briefing: Briefing; gaps: Gap[] }>("/api/structure", { transcript, permitText });
    step("llm", { state: "done", detail: `${briefing.hazards.length} hazards, ${gaps.length} gap${gaps.length === 1 ? "" : "s"}` });

    const id = `${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 8)}`;
    const locs = await pool(ROSTER_LANGS, 4, async (lang) => {
      step(lang, { state: "running" });
      const loc = await postJson<Localised>("/api/localise", { briefingId: id, briefing, lang });
      step(lang, { state: "done" });
      return loc;
    });
    return {
      id,
      createdAt: new Date().toISOString(),
      transcript,
      permitText,
      briefing,
      gaps,
      localised: Object.fromEntries(locs.map((l) => [l.lang, l])),
    };
  }

  return (
    <>
      <section className="pt-10 pb-8">
        <h1 className="sign text-5xl sm:text-7xl">Today&rsquo;s toolbox talk</h1>
        <p className="mt-3 max-w-xl text-lg text-ink-2">
          Speak the briefing once and add the permit. Every worker hears it in their own language, then proves they
          understood it.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Panel title="Briefing audio">
          <Segmented options={AUDIO_OPTS} value={audioSrc} onChange={setAudioSrc} name="Briefing audio source" />
          <div className="mt-4 min-h-14">
            {audioSrc === "sample" && <AudioButton src="/samples/sample_briefing.wav" label="sample briefing" />}
            {audioSrc === "noisy" && <AudioButton src="/samples/noisy_briefing.wav" label="noisy sample briefing" />}
            {audioSrc === "record" && <Recorder onDone={setRecorded} label="Record briefing" />}
            {audioSrc === "upload" && (
              <FilePick accept="audio/*" file={uploaded} onPick={setUploaded} hint="WAV, MP3, M4A or WebM" />
            )}
          </div>
          {(audioSrc === "sample" || audioSrc === "noisy") && (
            <p className="mt-2 text-sm text-ink-2">
              Hindi with English site terms, about 50 seconds. It mentions the welding but never the fire extinguisher.
            </p>
          )}
        </Panel>
        <Panel title="Permit-to-work">
          <Segmented options={PERMIT_OPTS} value={permitSrc} onChange={setPermitSrc} name="Permit source" />
          <div className="mt-4">
            {permitSrc === "sample" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/samples/sample_permit.jpg" alt="Sample permit-to-work for Block C, Level 3" className="h-44 w-auto border border-rule" />
            )}
            {permitSrc === "upload" && (
              <FilePick accept="image/*,application/pdf" file={permitFile} onPick={setPermitFile} hint="Photo or PDF of today's permit" />
            )}
            {permitSrc === "none" && <p className="text-sm text-ink-2">Gap check is skipped without a permit.</p>}
          </div>
        </Panel>
      </section>

      <section className="mt-6 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={run}
          disabled={running || !audioReady}
          className="sign bg-blue px-8 py-4 text-2xl text-white hover:bg-blue-deep disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? "Running…" : "Run briefing"}
        </button>
        {demo && <span className="bg-yellow px-2 py-1 text-sm font-semibold">Demo data is on: no Sarvam calls</span>}
      </section>

      {steps.length > 0 && (
        <section className="mt-6 max-w-xl border-l-4 border-ink bg-slab p-4">
          <Steps steps={steps} />
          {error && <p className="mt-3 font-semibold text-red">{error}</p>}
        </section>
      )}

      {record ? (
        <BriefingView rec={record} />
      ) : (
        !running && <p className="mt-12 text-ink-2">No briefing yet today. Run one above to share it with the crew.</p>
      )}
    </>
  );
}

function BriefingView({ rec }: { rec: BriefingRecord }) {
  const b = rec.briefing;
  const langs = Object.values(rec.localised);
  return (
    <div className="mt-14 space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b-4 border-ink pb-2">
        <h2 className="sign text-4xl">{b.site || "Today's briefing"}</h2>
        <span className="text-ink-2">
          {b.date ?? rec.createdAt.slice(0, 10)}
          {rec.demo ? " (demo data)" : ""}
        </span>
      </div>

      {rec.gaps.length > 0 ? (
        <section>
          <h3 className="sign mb-3 text-2xl text-red">Missing from your briefing</h3>
          <ul className="space-y-2">
            {rec.gaps.map((g, i) => (
              <li key={i} className={`border-l-8 p-3 ${g.severity === "high" ? "border-red bg-red-tint" : "border-yellow bg-slab"}`}>
                <div className="font-semibold">{g.missing}</div>
                <div className="mt-0.5 text-sm text-ink-2">Permit says: {g.permit_line}</div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-ink-2">Tell the crew these before work starts. They are included in every worker&rsquo;s audio.</p>
        </section>
      ) : (
        rec.permitText && <p className="border-l-8 border-green bg-slab p-3 font-semibold">Every hazard on the permit was covered.</p>
      )}

      <div className="grid gap-10 lg:grid-cols-[3fr_2fr]">
        <section>
          <h3 className="sign mb-3 text-2xl">Hazards and controls</h3>
          <ul className="divide-y divide-rule border-y border-rule">
            {b.hazards.map((h, i) => (
              <li key={i} className="grid grid-cols-[1fr_auto] gap-x-4 py-3">
                <div>
                  <div className="font-semibold">{h.item}</div>
                  <div className="text-ink-2">{h.control}</div>
                </div>
                <span
                  className={`self-start border px-2 py-0.5 text-xs font-semibold ${
                    h.source === "briefing" ? "border-ink text-ink" : "border-ink-2 bg-concrete text-ink-2"
                  }`}
                  title={h.source === "briefing" ? "The supervisor said this" : "Only on the permit"}
                >
                  {h.source === "briefing" ? "Said in briefing" : "From permit"}
                </span>
              </li>
            ))}
          </ul>
          {b.tasks.length > 0 && (
            <>
              <h3 className="sign mt-8 mb-3 text-2xl">Crew tasks</h3>
              <ul className="space-y-1">
                {b.tasks.map((t, i) => (
                  <li key={i}>
                    <span className="font-semibold">{t.crew}:</span> {t.task}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <aside className="space-y-8">
          <section>
            <h3 className="sign mb-3 text-2xl">Wear</h3>
            <ul className="flex flex-wrap gap-3">
              {b.ppe.map((p) => (
                <li key={p} className="flex w-20 flex-col items-center gap-1 text-center text-sm leading-tight">
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-blue text-lg font-bold text-white" aria-hidden="true">
                    {p.slice(0, 1).toUpperCase()}
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="sign mb-2 text-2xl">In an emergency</h3>
            <p>
              Go to <strong>{b.emergency.assembly_point || "the assembly point"}</strong>.
              {b.emergency.contact && (
                <>
                  {" "}
                  Call <strong>{b.emergency.contact}</strong>.
                </>
              )}
            </p>
          </section>
          <section>
            <h3 className="sign mb-2 text-2xl">Each worker is asked</h3>
            <p className="font-semibold">{b.quiz[0]?.q}</p>
            <p className="text-sm text-ink-2">Expected: {b.quiz[0]?.expected_answer}</p>
          </section>
        </aside>
      </div>

      <section>
        <h3 className="sign mb-3 text-2xl">What the crew hears</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {langs.map((l) => (
            <div key={l.lang} className="border-t-4 border-blue bg-slab p-4">
              <div className="mb-3 flex items-baseline justify-between">
                <span className="text-xl font-semibold">{LANG_NATIVE[l.lang] ?? langName(l.lang)}</span>
                <span className="text-sm text-ink-2">{langName(l.lang)}</span>
              </div>
              <AudioButton src={l.audioUrl} label={`${langName(l.lang)} briefing`} />
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-ink-2">Read the text</summary>
                <div className="mt-2 space-y-1">
                  {l.lines.map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
              </details>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="sign mb-3 text-2xl">Send to the crew</h3>
        <p className="mb-3 text-ink-2">Each worker opens their own link on their phone.</p>
        <ul className="flex flex-wrap gap-2">
          {ROSTER.map((w) => (
            <li key={w.name}>
              <a href={`/worker?w=${encodeURIComponent(w.name)}`} className="block border-2 border-ink bg-slab px-3 py-1.5 font-semibold hover:bg-concrete">
                {w.name} <span className="font-normal text-ink-2">{langName(w.language)}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <details className="text-sm">
        <summary className="cursor-pointer text-ink-2">Transcript and permit text</summary>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div>
            <div className="font-semibold">Saaras transcript</div>
            <p className="mt-1 whitespace-pre-wrap">{rec.transcript}</p>
          </div>
          <div>
            <div className="font-semibold">Sarvam Vision permit text</div>
            <p className="mt-1 whitespace-pre-wrap">{rec.permitText || "No permit"}</p>
          </div>
        </div>
      </details>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-2 border-ink bg-slab p-5">
      <h2 className="sign mb-4 text-2xl">{title}</h2>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
  name,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  name: string;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`border px-3 py-1.5 text-sm font-semibold ${
            value === o.id ? "border-ink bg-ink text-slab" : "border-rule text-ink-2 hover:border-ink hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function FilePick({ accept, file, onPick, hint }: { accept: string; file: File | null; onPick: (f: File | null) => void; hint: string }) {
  return (
    <label className="block cursor-pointer border-2 border-dashed border-rule p-4 hover:border-ink">
      <input type="file" accept={accept} className="sr-only" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
      <span className="font-semibold">{file ? file.name : "Choose a file"}</span>
      <span className="block text-sm text-ink-2">{hint}</span>
    </label>
  );
}
