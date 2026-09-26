export type StepState = "waiting" | "running" | "done" | "error";
export interface Step {
  id: string;
  label: string;
  detail?: string;
  state: StepState;
}

const DOT: Record<StepState, string> = {
  waiting: "border-rule bg-slab",
  running: "border-blue bg-blue animate-pulse",
  done: "border-green bg-green",
  error: "border-red bg-red",
};

/** The pipeline really is a sequence, so it is shown as an ordered list. */
export function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="space-y-2" aria-live="polite">
      {steps.map((s) => (
        <li key={s.id} className="flex items-start gap-3">
          <span className={`mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${DOT[s.state]}`} aria-hidden="true" />
          <div className="min-w-0">
            <span className={s.state === "waiting" ? "text-ink-2" : "font-semibold"}>{s.label}</span>
            {s.detail && <span className="ml-2 text-sm text-ink-2">{s.detail}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}
