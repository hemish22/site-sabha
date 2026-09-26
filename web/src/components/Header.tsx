"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { setDemo, useDemo } from "@/lib/client";

const NAV = [
  { href: "/", label: "Brief" },
  { href: "/worker", label: "Worker" },
  { href: "/board", label: "Tag board" },
];

export function Header() {
  const path = usePathname();
  const demo = useDemo();
  return (
    <header className="border-b-4 border-ink bg-slab">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2" aria-label="Site Sabha home">
          <Mark />
          <span className="sign text-2xl">Site Sabha</span>
        </Link>
        <nav className="order-3 flex w-full gap-1 sm:order-none sm:w-auto" aria-label="Main">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`condensed px-3 py-1.5 text-[15px] font-semibold ${
                  active ? "bg-ink text-slab" : "text-ink-2 hover:bg-concrete hover:text-ink"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2 text-sm text-ink-2">
          <span id="demo-label">Demo data</span>
          <button
            type="button"
            role="switch"
            aria-checked={demo}
            aria-labelledby="demo-label"
            onClick={() => setDemo(!demo)}
            className={`relative h-6 w-11 rounded-full border-2 border-ink transition-colors ${demo ? "bg-yellow" : "bg-slab"}`}
            title="Use the pre-recorded sample run instead of calling Sarvam"
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-ink transition-[left] ${demo ? "left-5" : "left-0.5"}`} />
          </button>
        </div>
      </div>
    </header>
  );
}

/** Hard hat in a mandatory-sign circle. */
function Mark() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="var(--color-blue)" />
      <path d="M7 20h18v2.5H7z" fill="#fff" />
      <path d="M9 20a7 7 0 0 1 14 0z" fill="#fff" />
      <path d="M15 10.5h2v5h-2z" fill="var(--color-blue)" />
    </svg>
  );
}
