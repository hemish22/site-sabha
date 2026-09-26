// Browser-side audio prep. Vercel functions have no ffmpeg, so the browser
// decodes any recording/upload to 16 kHz mono PCM, splits it under Saaras's
// 30 s REST limit, and uploads small WAV chunks.

const RATE = 16000;
export const CHUNK_SECONDS = 25;

export async function decodeToMono16k(blob: Blob): Promise<Float32Array> {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(buf.duration * RATE)), RATE);
    const src = off.createBufferSource();
    src.buffer = buf;
    src.connect(off.destination);
    src.start();
    const rendered = await off.startRendering();
    return rendered.getChannelData(0);
  } finally {
    void ctx.close();
  }
}

export function encodeWav(samples: Float32Array, rate = RATE): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export function splitChunks(samples: Float32Array, seconds = CHUNK_SECONDS, rate = RATE): Float32Array[] {
  const size = seconds * rate;
  const out: Float32Array[] = [];
  for (let i = 0; i < samples.length; i += size) out.push(samples.subarray(i, i + size));
  return out;
}

export const durationOf = (samples: Float32Array, rate = RATE) => samples.length / rate;
