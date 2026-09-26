"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AudioButton } from "@/components/AudioButton";
import { Recorder } from "@/components/Recorder";
import { decodeToMono16k, encodeWav } from "@/lib/audio";
import { api, fetchBlob, postForm, postJson, useDemo } from "@/lib/client";
import { LANG_NATIVE, langName, ROSTER } from "@/lib/config";
import type { BriefingRecord, Verdict } from "@/lib/types";

const SAMPLES = [
  { key: "ta_correct", label: "Tamil, clear answer" },
  { key: "bn_vague", label: "Bengali, vague answer" },
  { key: "od_wrong", label: "Odia, wrong answer" },
] as const;

const VERDICT: Record<Verdict, { title: string; body: string; cls: string }> = {
  understood: { title: "Understood", body: "You are cleared for today's work.", cls: "bg-green text-white" },
  partial: { title: "Partly understood", body: "Your supervisor will go over this with you again.", cls: "bg-yellow text-ink" },
  not_understood: { title: "Re-brief needed", body: "Listen again, or ask your supervisor before starting work.", cls: "bg-red text-white" },
};

interface Result {
  transcript: string;
  verdict: Verdict;
  reason: string;
}

export function WorkerView({ name }: { name: string | null }) {
  const demo = useDemo();
  const [rec, setRec] = useState<BriefingRecord | null | undefined>(undefined);
  const [answer, setAnswer] = useState<Blob | null>(null);
  const [sample, setSample] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const heardSent = useRef(false);

  const worker = ROSTER.find((w) => w.name === name) ?? null;

  useEffect(() => {
    api<BriefingRecord | null>("/api/briefings").then(setRec).catch(() => setRec(null));
  }, []);

  if (!worker) {
    return (
      <section className="pt-10">
        <h1 className="sign text-5xl">Who are you?</h1>
        <p className="mt-2 text-ink-2">Tap your name to hear today&rsquo;s briefing in your language.</p>
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ROSTER.map((w) => (
            <li key={w.name}>
              <Link href={`/worker?w=${encodeURIComponent(w.name)}`} className="block border-2 border-ink bg-slab p-4 hover:bg-concrete">
                <span className="block text-xl font-semibold">{w.name}</span>
                <span className="text-ink-2">{LANG_NATIVE[w.language] ?? langName(w.language)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const loc = rec?.localised[worker.language];
  const q = loc?.quiz[0];

  const markHeard = () => {
    if (heardSent.current || !rec) return;
    heardSent.current = true;
    postJson("/api/acks", { worker: worker.name, briefingId: rec.id, event: "heard" }).catch(() => {
      heardSent.current = false;
    });
  };

  async function submit() {
    if (!rec) return;
    setBusy(true);
    setError("");
    try {
      let res: Result;
      if (sample && demo) {
        const pre = (await api<Record<string, Result>>("/demo/answers.json"))[sample];
        res = await postForm<Result>("/api/answer", { worker: worker!.name, briefingId: rec.id, precomputed: JSON.stringify(pre) });
      } else {
        const raw = sample ? await fetchBlob(`/samples/answers/${sample}.wav`) : answer!;
        // Saaras REST takes up to 30 s; a spoken answer is well under that.
        const pcm = (await decodeToMono16k(raw)).subarray(0, 28 * 16000);
        res = await postForm<Result>("/api/answer", { worker: worker!.name, briefingId: rec.id, file: [encodeWav(pcm), "answer.wav"] });
      }
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl pt-8">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="sign text-5xl">{worker.name}</h1>
        <Link href="/worker" className="text-sm font-semibold text-blue underline underline-offset-2">
          Not you?
        </Link>
      </div>
      <p className="mt-1 text-lg text-ink-2">
        {LANG_NATIVE[worker.language]} ({langName(worker.language)})
      </p>

      {rec === undefined && <p className="mt-10 text-ink-2">Loading today&rsquo;s briefing…</p>}
      {rec === null && <p className="mt-10 text-lg">There is no briefing yet today. Check back after your supervisor records it.</p>}
      {rec && !loc && <p className="mt-10 text-lg">Today&rsquo;s briefing has no {langName(worker.language)} version yet. Ask your supervisor.</p>}

      {loc && (
        <>
          <section className="mt-8 border-t-4 border-ink pt-5">
            <h2 className="sign text-3xl">1. Listen</h2>
            <div className="mt-4">
              <AudioButton src={loc.audioUrl} label="today's briefing" size="lg" onPlay={markHeard} />
            </div>
            <details className="mt-4">
              <summary className="cursor-pointer text-ink-2">Read it instead</summary>
              <div className="mt-2 space-y-2 text-lg leading-relaxed">
                {loc.lines.map((l, i) => (
                  <p key={i}>{l}</p>
                ))}
              </div>
            </details>
          </section>

          {q && (
            <section className="mt-10 border-t-4 border-ink pt-5">
              <h2 className="sign text-3xl">2. Answer one question</h2>
              <p className="mt-4 text-2xl leading-snug font-semibold">{q.q_local}</p>
              <p className="mt-1 text-sm text-ink-2">{q.q}</p>
              <div className="mt-3">
                <AudioButton src={q.audioUrl} label="the question" />
              </div>

              {result ? (
                <ResultTag result={result} onRetry={() => { setResult(null); setAnswer(null); setSample(null); }} />
              ) : (
                <>
                  <div className="mt-6">
                    <Recorder size="lg" label="Tap and speak your answer" onDone={(b) => { setAnswer(b); if (b) setSample(null); }} />
                  </div>

                  <details className="mt-5 text-sm" open={!!sample}>
                    <summary className="cursor-pointer text-ink-2">No microphone? Try a sample answer</summary>
                    <div className="mt-3 space-y-2">
                      {SAMPLES.map((s) => (
                        <label key={s.key} className={`flex items-center gap-3 border p-2 ${sample === s.key ? "border-ink bg-slab" : "border-rule"}`}>
                          <input
                            type="radio"
                            name="sample"
                            aria-label={s.label}
                            checked={sample === s.key}
                            onChange={() => { setSample(s.key); setAnswer(null); }}
                          />
                          <span className="w-44 shrink-0 font-semibold">{s.label}</span>
                          <audio src={`/samples/answers/${s.key}.wav`} controls className="h-8 min-w-0 flex-1" />
                        </label>
                      ))}
                    </div>
                  </details>

                  <button
                    type="button"
                    onClick={submit}
                    disabled={busy || (!answer && !sample)}
                    className="sign mt-6 w-full bg-blue py-4 text-2xl text-white hover:bg-blue-deep disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? "Checking…" : "Check my answer"}
                  </button>
                  {error && <p className="mt-3 font-semibold text-red">{error}</p>}
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function ResultTag({ result, onRetry }: { result: Result; onRetry: () => void }) {
  const v = VERDICT[result.verdict];
  return (
    <div className="stamp mt-6" role="status">
      <div className={`tag px-5 pt-12 pb-5 ${v.cls}`}>
        <div className="sign text-4xl">{v.title}</div>
        <p className="mt-1 text-lg">{v.body}</p>
      </div>
      <div className="border-2 border-t-0 border-ink bg-slab p-4 text-sm">
        <div className="text-ink-2">We heard</div>
        <p className="text-lg">&ldquo;{result.transcript}&rdquo;</p>
        <p className="mt-2 text-ink-2">{result.reason}</p>
        {result.verdict !== "understood" && (
          <button type="button" onClick={onRetry} className="mt-3 font-semibold text-blue underline underline-offset-2">
            Answer again
          </button>
        )}
      </div>
    </div>
  );
}
