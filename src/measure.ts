export const FONT_FAMILY =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

let ctx: CanvasRenderingContext2D | null = null;
export function measureCtx(): CanvasRenderingContext2D {
  if (!ctx) ctx = document.createElement("canvas").getContext("2d")!;
  return ctx;
}

/** Bungkus teks ke beberapa baris sesuai lebar maksimum. Font harus sudah di-set pada ctx. */
export function wrapWith(c: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  const paragraphs = (text || " ").split("\n");
  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (c.measureText(test).width <= maxW) {
        line = test;
        continue;
      }
      if (line) out.push(line);
      if (c.measureText(word).width <= maxW) {
        line = word;
      } else {
        // kata terlalu panjang: potong per karakter
        let chunk = "";
        for (const ch of word) {
          if (c.measureText(chunk + ch).width > maxW && chunk) {
            out.push(chunk);
            chunk = ch;
          } else chunk += ch;
        }
        line = chunk;
      }
    }
    out.push(line);
  }
  return out;
}

const cache = new Map<string, string[]>();
export function wrapCached(font: string, text: string, maxW: number): string[] {
  const key = `${font}|${maxW}|${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = measureCtx();
  c.font = font;
  const r = wrapWith(c, text, maxW);
  if (cache.size > 3000) cache.clear();
  cache.set(key, r);
  return r;
}

export function textWidth(font: string, text: string): number {
  const c = measureCtx();
  c.font = font;
  return c.measureText(text).width;
}
