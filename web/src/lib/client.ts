"use client";
import { useSyncExternalStore } from "react";

// Demo mode: the supervisor pipeline and sample answers come from /public/demo
// instead of Sarvam. Records still go to Blob so the tag board works the same.
const KEY = "sabha-demo";
const listeners = new Set<() => void>();

function readDemo(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setDemo(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* storage blocked: stays in memory for this page only */
  }
  listeners.forEach((l) => l());
}

export function useDemo(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      window.addEventListener("storage", cb);
      return () => {
        listeners.delete(cb);
        window.removeEventListener("storage", cb);
      };
    },
    readDemo,
    () => false,
  );
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data && typeof data === "object" && "error" in data && data.error)) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const postJson = <T,>(url: string, body: unknown) =>
  api<T>(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const postForm = <T,>(url: string, fields: Record<string, string | Blob | [Blob, string]>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) fd.append(k, v[0], v[1]);
    else fd.append(k, v);
  }
  return api<T>(url, { method: "POST", body: fd });
};

export async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url}`);
  return res.blob();
}

/** Run async jobs with a concurrency cap, preserving order. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
