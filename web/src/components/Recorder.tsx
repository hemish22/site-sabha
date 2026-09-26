"use client";
import { useEffect, useRef, useState } from "react";

/** Tap to record, tap to stop. Hands the recording to `onDone`. */
export function Recorder({
  onDone,
  label = "Record",
  size = "md",
}: {
  onDone: (blob: Blob | null) => void;
  label?: string;
  size?: "md" | "lg";
}) {
  const [state, setState] = useState<"idle" | "recording" | "done">("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      rec.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const start = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const parts: Blob[] = [];
      mr.ondataavailable = (e) => e.data.size && parts.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(parts, { type: mr.mimeType || "audio/webm" });
        setUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(blob);
        });
        setState("done");
        onDone(blob);
      };
      rec.current = mr;
      mr.start();
      setSeconds(0);
      setState("recording");
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError("Microphone is blocked. Allow microphone access for this site, then try again.");
    }
  };

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    rec.current?.stop();
  };

  const reset = () => {
    setState("idle");
    onDone(null);
  };

  const big = size === "lg";
  const recording = state === "recording";

  return (
    <div>
      {state !== "done" ? (
        <button
          type="button"
          onClick={recording ? stop : start}
          className={`flex items-center gap-3 border-2 font-semibold ${
            recording ? "border-red bg-red text-white" : "border-ink bg-slab text-ink hover:bg-concrete"
          } ${big ? "w-full justify-center py-5 text-xl" : "px-4 py-2.5"}`}
        >
          <span
            className={`inline-block rounded-full ${recording ? "animate-pulse bg-white" : "bg-red"} ${big ? "h-5 w-5" : "h-3 w-3"}`}
            aria-hidden="true"
          />
          {recording ? `Stop (${seconds}s)` : label}
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <audio src={url} controls className="h-10 max-w-full" />
          <button type="button" onClick={reset} className="text-sm font-semibold text-blue underline underline-offset-2">
            Record again
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red">{error}</p>}
    </div>
  );
}
