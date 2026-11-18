import { PitchCfg, frameAt, totalSeconds } from "./pitchPlayer";
import { SH, SW } from "./pitchRender";
import { Slide } from "./slides";
import { Theme } from "./themes";

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

/**
 * Merekam linimasa Pitch ke video secara real-time dari kanvas.
 * Tab harus tetap terbuka selama proses berjalan.
 */
export async function exportVideo(
  slides: Slide[],
  theme: Theme,
  cfg: PitchCfg,
  opts: { onProgress?: (p: number) => void; signal?: AbortSignal; fps?: number } = {}
): Promise<VideoResult> {
  const pick = pickVideoMime();
  if (!pick) throw new Error("Browser ini tidak mendukung perekaman video (MediaRecorder).");
  if (!slides.length) throw new Error("Tidak ada slide untuk diekspor.");

  const fps = opts.fps ?? 30;
  const canvas = document.createElement("canvas");
  canvas.width = SW;
  canvas.height = SH;
  const ctx = canvas.getContext("2d")!;
  frameAt(ctx, slides, theme, cfg, 0);

  const stream = canvas.captureStream(fps);
  const rec = new MediaRecorder(stream, { mimeType: pick.mime, videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((res) => (rec.onstop = () => res()));

  const dur = totalSeconds(slides.length, cfg);
  const total = dur + 0.6; // tahan bingkai terakhir sebentar
  rec.start(250);
  const t0 = performance.now();

  try {
    await new Promise<void>((resolve, reject) => {
      const tick = () => {
        if (opts.signal?.aborted) {
          reject(new DOMException("Dibatalkan", "AbortError"));
          return;
        }
        const t = (performance.now() - t0) / 1000;
        frameAt(ctx, slides, theme, cfg, Math.min(t, dur));
        opts.onProgress?.(Math.min(1, t / total));
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
