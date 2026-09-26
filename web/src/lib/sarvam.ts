import "server-only";
import { SarvamAIClient } from "sarvamai";

const BASE = "https://api.sarvam.ai";

export function apiKey(): string {
  const key = process.env.SARVAM_API_KEY;
  if (!key) throw new Error("SARVAM_API_KEY is not set on the server");
  return key;
}

let client: SarvamAIClient | null = null;

export function sarvam(): SarvamAIClient {
  client ??= new SarvamAIClient({ apiSubscriptionKey: apiKey(), timeoutInSeconds: 60 });
  return client;
}

/** Retry on rate limits and transient 5xx, with backoff. */
export async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const status = (e as { statusCode?: number; status?: number }).statusCode ?? (e as { status?: number }).status;
      if (status && status < 500 && status !== 429) throw e;
      await new Promise((r) => setTimeout(r, 800 * 2 ** i));
    }
  }
  throw last;
}

/**
 * Chat completions over REST. The JS SDK cannot send reasoning_effort: null,
 * and with reasoning on, sarvam-105b spends its whole token budget thinking
 * on the structure prompt and returns empty content.
 */
export async function chatJson<T>(prompt: string, schemaName: string, schema: object): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const body: Record<string, unknown> = {
      model: "sarvam-105b",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      reasoning_effort: null,
      max_tokens: 4096,
    };
    if (attempt < 2) {
      body.response_format = { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } };
    }
    try {
      const res = await fetch(`${BASE}/v1/chat/completions`, {
        method: "POST",
        headers: { "api-subscription-key": apiKey(), "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`sarvam-105b HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      return parseJson<T>(data.choices?.[0]?.message?.content ?? "");
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`sarvam-105b did not return valid JSON: ${String(lastErr)}`);
}

export function parseJson<T>(raw: string): T {
  let text = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  try {
    return JSON.parse(text);
  } catch {
    const starts = [text.indexOf("{"), text.indexOf("[")].filter((i) => i >= 0);
    if (!starts.length) throw new Error(`no JSON in model output: ${text.slice(0, 200)}`);
    const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
    return JSON.parse(text.slice(Math.min(...starts), end + 1));
  }
}
