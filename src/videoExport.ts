import { FrameOpts, SH, SW, drawFrame } from "./pitchRender";
import { TRANS_SEC } from "./pitchPlayer";
import { Step } from "./pitchScenes";

export interface VideoResult {
  blob: Blob;
  ext: "mp4" | "webm";
}

export function pickVideoMime(): { mime: string; ext: "mp4" | "webm" } | null {
  if (typeof MediaRecorder === "undefined") return null;
  const cands: [string, "mp4" | "webm"][] = [
    ["video/mp4;codecs=avc1.42E01E", "mp4"],
    ["video/mp4", "mp4"],
    ["video/webm;codecs=vp9", "webm"],
    ["video/webm;codecs=vp8", "webm"],
    ["video/webm", "webm"],
  ];
  for (const [mime, ext] of cands) if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  return null;
}

export const videoSeconds = (n: number, perStep: number) => Math.max(1, n) * perStep + 0.8;

/** Merekam rangkaian langkah Pitch (termasuk gerak antar langkah) ke video, real-time dari kanvas. */
export async function exportVideo(
  steps: Step[],
  opts: FrameOpts,
  perStep: number,
  cb: { onProgress?: (p: number) => void; signal?: AbortSignal; fps?: number } = {}
): Promise<VideoResult> {
  const pick = pickVideoMime();
  if (!pick) throw new Error("Browser ini tidak mendukung perekaman video (MediaRecorder).");
  if (!steps.length) throw new Error("Tidak ada langkah untuk diekspor.");
  const fps = cb.fps ?? 30;
  const canvas = document.createElement("canvas");
  canvas.width = SW;
  canvas.height = SH;
  const ctx = canvas.getContext("2d")!;
  drawFrame(ctx, null, steps[0], 1, opts);

  const stream = canvas.captureStream(fps);
  const rec = new MediaRecorder(stream, { mimeType: pick.mime, videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((res) => (rec.onstop = () => res()));
  const total = videoSeconds(steps.length, perStep);
  rec.start(250);
  const t0 = performance.now();
  try {
    await new Promise<void>((resolve, reject) => {
      const tick = () => {
        if (cb.signal?.aborted) return reject(new DOMException("Dibatalkan", "AbortError"));
        const t = (performance.now() - t0) / 1000;
        const i = Math.min(steps.length - 1, Math.floor(t / perStep));
        const local = t - i * perStep;
        const tr = i > 0 ? Math.min(1, local / TRANS_SEC) : 1;
        drawFrame(ctx, i > 0 && tr < 1 ? steps[i - 1] : null, steps[i], tr, opts);
        cb.onProgress?.(Math.min(1, t / total));
        if (t >= total) resolve();
        else setTimeout(tick, 1000 / fps);
      };
      tick();
    });
  } finally {
    if (rec.state !== "inactive") rec.stop();
    stream.getTracks().forEach((tr) => tr.stop());
  }
  await stopped;
  return { blob: new Blob(chunks, { type: pick.mime.split(";")[0] }), ext: pick.ext };
}
