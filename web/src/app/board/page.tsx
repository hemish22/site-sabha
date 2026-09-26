"use client";
import { useEffect, useRef, useState } from "react";
import { api, postJson } from "@/lib/client";
import { LANG_NATIVE, langName } from "@/lib/config";
import type { BriefingRecord, GridRow, WorkerStatus } from "@/lib/types";

// Scaffold tag colours: green safe, yellow caution, red do-not-proceed.
const TAG: Record<WorkerStatus, { word: string; band: string; body: string }> = {
  understood: { word: "Understood", band: "bg-green text-white", body: "bg-slab" },
  partial: { word: "Partial", band: "bg-yellow text-ink", body: "bg-slab" },
  "re-brief": { word: "Re-brief", band: "bg-red text-white", body: "bg-slab" },
  heard: { word: "Heard, not answered", band: "bg-ink text-slab", body: "bg-slab" },
  absent: { word: "Not heard yet", band: "bg-rule text-ink-2", body: "bg-concrete" },
};

export default function BoardPage() {
  const [rec, setRec] = useState<BriefingRecord | null | undefined>(undefined);
  const [grid, setGrid] = useState<GridRow[]>([]);
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const prev = useRef<Map<string, WorkerStatus> | null>(null);

  useEffect(() => {
    api<BriefingRecord | null>("/api/briefings").then(setRec).catch(() => setRec(null));
  }, []);

  useEffect(() => {
    if (!rec) return;
    let alive = true;
    const load = async () => {
      try {
        const { grid } = await api<{ grid: GridRow[] }>(`/api/acks?bid=${encodeURIComponent(rec.id)}`);
        if (!alive) return;
        // Only tags whose status changed since the last poll get the stamp animation.
        const now = new Map(grid.map((g) => [g.worker, g.status]));
        if (prev.current) setChanged(new Set(grid.filter((g) => prev.current!.get(g.worker) !== g.status).map((g) => g.worker)));
        prev.current = now;
        setGrid(grid);
      } catch {
        /* keep showing the last good grid */
      }
    };
    void load();
    const t = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [rec]);

  const rebrief = async (worker: string) => {
    if (!rec) return;
    await postJson("/api/acks", { worker, briefingId: rec.id, event: "rebrief" });
    setGrid((g) => g.map((r) => (r.worker === worker ? { ...r, status: "re-brief", reason: "Re-brief requested by supervisor" } : r)));
  };

  const count = (s: WorkerStatus) => grid.filter((g) => g.status === s).length;

  return (
    <>
      <section className="flex flex-wrap items-end justify-between gap-4 pt-10 pb-6">
        <div>
          <h1 className="sign text-5xl sm:text-7xl">Tag board</h1>
          {rec && (
            <p className="mt-3 text-lg text-ink-2">
              {rec.briefing.site || "Today's briefing"}, {rec.briefing.date ?? rec.createdAt.slice(0, 10)}
              {rec.demo ? " (demo data)" : ""}. Updates every few seconds.
            </p>
          )}
        </div>
        {rec && (
          <a href={`/api/export?bid=${encodeURIComponent(rec.id)}`} className="border-2 border-ink bg-slab px-4 py-2 font-semibold hover:bg-concrete">
            Download audit CSV
          </a>
        )}
      </section>

      {rec === undefined && <p className="text-ink-2">Loading…</p>}
      {rec === null && <p className="text-lg">No briefing yet. Run one on the Brief page and the crew&rsquo;s tags will appear here.</p>}

      {rec && grid.length > 0 && (
        <>
          <p className="mb-8 max-w-3xl text-2xl leading-snug">
            <strong className="text-green">{count("understood")} of {grid.length}</strong> understood.{" "}
            {count("partial") + count("re-brief") > 0 && (
              <>
                <strong className="text-red">{count("partial") + count("re-brief")}</strong> need{count("partial") + count("re-brief") === 1 ? "s" : ""} a re-brief.{" "}
              </>
            )}
            {count("absent") + count("heard") > 0 && <>{count("absent") + count("heard")} still to answer.</>}
          </p>

          <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
            {grid.map((g) => {
              const t = TAG[g.status];
              return (
                <li key={g.worker} className={changed.has(g.worker) ? "stamp" : undefined}>
                  <article className={`tag flex h-full flex-col ${t.body} ${g.status === "absent" ? "opacity-80" : ""}`}>
                    <div className={`px-3 pt-10 pb-3 ${t.band}`}>
                      <div className="sign text-2xl">{t.word}</div>
                    </div>
                    <div className="flex flex-1 flex-col border-x-2 border-b-2 border-ink/20 p-3">
                      <h2 className="text-xl font-semibold">{g.worker}</h2>
                      <p className="text-sm text-ink-2">
                        {LANG_NATIVE[g.language]} ({langName(g.language)})
                      </p>
                      {g.answer && <p className="mt-2 line-clamp-3 text-sm">&ldquo;{g.answer}&rdquo;</p>}
                      {g.reason && <p className="mt-1 line-clamp-3 text-xs text-ink-2">{g.reason}</p>}
                      <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-3 text-sm">
                        <a href={`/worker?w=${encodeURIComponent(g.worker)}`} className="font-semibold text-blue underline underline-offset-2">
                          Worker link
                        </a>
                        {(g.status === "partial" || (g.status === "re-brief" && g.reason !== "Re-brief requested by supervisor")) && (
                          <button type="button" onClick={() => rebrief(g.worker)} className="font-semibold text-red underline underline-offset-2">
                            Ask to re-brief
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
