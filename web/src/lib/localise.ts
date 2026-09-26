import "server-only";
import { putFile } from "./store";
import { sarvam, withRetry } from "./sarvam";
import type { Briefing, Localised } from "./types";

const TTS_SPEAKER = "shubh";
const TTS_MAX_CHARS = 2000;

/** Short English sentences for the spoken briefing, in reading order. */
export function briefingToScript(b: Briefing): string[] {
  const strip = (s: string) => s.replace(/\.+$/, "");
  const lines = [`Safety briefing for ${b.site || "today"}.`];
  for (const h of b.hazards ?? []) {
    lines.push(h.control ? `Danger: ${strip(h.item)}. ${strip(h.control)}.` : `Danger: ${strip(h.item)}.`);
  }
  if (b.ppe?.length) lines.push(`Wear this PPE: ${b.ppe.join(", ")}.`);
  for (const t of b.tasks ?? []) lines.push(`${t.crew} crew: ${strip(t.task)}.`);
  if (b.emergency?.assembly_point) lines.push(`In an emergency, go to the assembly point: ${b.emergency.assembly_point}.`);
  if (b.emergency?.contact) lines.push(`Emergency contact: ${b.emergency.contact}.`);
  return lines;
}

/**
 * mayura:v1 in code-mixed mode keeps safety terms (harness, scaffold, fire
 * extinguisher) in English the way crews say them. sarvam-translate:v1
 * rendered "harness" in Bengali as a horse's harness.
 */
export async function translate(text: string, target: string): Promise<string> {
  if (target === "en-IN") return text;
  const r = await withRetry(() =>
    sarvam().text.translate({
      input: text,
      source_language_code: "en-IN",
      target_language_code: target as never,
      model: "mayura:v1",
      mode: "code-mixed",
    }),
  );
  return r.translated_text;
}

function chunks(lines: string[], limit = TTS_MAX_CHARS): string[] {
  const out: string[] = [];
  let cur = "";
  for (const l of lines) {
    if (cur && cur.length + l.length + 1 > limit) {
      out.push(cur);
      cur = "";
    }
    cur = `${cur} ${l}`.trim();
  }
  if (cur) out.push(cur);
  return out;
}

export async function speak(lines: string[], lang: string): Promise<Buffer> {
  const parts: Buffer[] = [];
  for (const text of chunks(lines)) {
    const r = await withRetry(() =>
      sarvam().textToSpeech.convert({
        text,
        language_code: lang as never,
        model: "bulbul:v3",
        speaker: TTS_SPEAKER as never,
        output_audio_codec: "mp3",
      }),
    );
    for (const a of r.audios) parts.push(Buffer.from(a, "base64"));
  }
  // MP3 frames are self-contained, so clips can be joined byte-for-byte.
  return Buffer.concat(parts);
}

export async function localise(briefing: Briefing, briefingId: string, lang: string): Promise<Localised> {
  const scriptEn = briefingToScript(briefing);
  const [lines, quizLocal] = await Promise.all([
    Promise.all(scriptEn.map((l) => translate(l, lang))),
    Promise.all((briefing.quiz ?? []).map((q) => translate(q.q, lang))),
  ]);
  const [audio, ...quizAudio] = await Promise.all([speak(lines, lang), ...quizLocal.map((q) => speak([q], lang))]);
  const [audioUrl, ...quizUrls] = await Promise.all([
    putFile(`audio/${briefingId}/${lang}.mp3`, audio, "audio/mpeg"),
    ...quizAudio.map((a, i) => putFile(`audio/${briefingId}/${lang}_q${i}.mp3`, a, "audio/mpeg")),
  ]);
  return {
    lang,
    lines,
    scriptEn,
    audioUrl,
    quiz: (briefing.quiz ?? []).map((q, i) => ({ ...q, q_local: quizLocal[i], audioUrl: quizUrls[i] })),
  };
}
