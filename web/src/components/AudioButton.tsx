"use client";
import { useRef, useState } from "react";

/** Play/pause button with a progress bar. `size="lg"` is the worker screen's thumb-sized control. */
export function AudioButton({
  src,
  label,
  size = "md",
  onPlay,
}: {
  src: string;
  label: string;
  size?: "md" | "lg";
  onPlay?: () => void;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) {
      void a.play();
    } else {
      a.pause();
    }
  };

  const big = size === "lg";
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className={`flex items-center ${big ? "gap-4" : "gap-3"}`}>
      <button
        type="button"
        onClick={toggle}
        aria-label={`${playing ? "Pause" : "Play"} ${label}`}
        className={`grid shrink-0 place-items-center rounded-full bg-blue text-white hover:bg-blue-deep ${
          big ? "h-20 w-20" : "h-11 w-11"
        }`}
      >
        {playing ? (
          <svg viewBox="0 0 24 24" className={big ? "h-9 w-9" : "h-5 w-5"} fill="currentColor" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" />
            <rect x="14" y="5" width="4" height="14" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className={big ? "ml-1 h-10 w-10" : "ml-0.5 h-5 w-5"} fill="currentColor" aria-hidden="true">
            <path d="M7 4.5v15l13-7.5z" />
          </svg>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div className={`h-2 w-full bg-rule ${big ? "h-3" : ""}`}>
          <div className="h-full bg-blue" style={{ width: `${duration ? (progress / duration) * 100 : 0}%` }} />
        </div>
        <div className="mt-1 text-xs tabular-nums text-ink-2">
          {fmt(progress)} / {duration ? fmt(duration) : "–:––"}
        </div>
      </div>
      <audio
        ref={ref}
        src={src}
        preload="metadata"
        onPlay={() => {
          setPlaying(true);
          onPlay?.();
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onEmptied={() => {
          setPlaying(false);
          setProgress(0);
        }}
        onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
      />
    </div>
  );
}
