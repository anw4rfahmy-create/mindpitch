import { NodeShape, PatternId } from "./types";

/** Arsir bergaya sketsa tangan: isi coretan + tepi bergoyang. */
export const SKETCH_IDS = ["sk-solid", "sk-diag", "sk-diag2", "sk-cross", "sk-horiz"] as const;
export const isSketch = (p?: PatternId | string): boolean => !!p && (p as string).startsWith("sk-");

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed: number) {
  let a = seed || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Pt = [number, number];
const f = (n: number) => Math.round(n * 10) / 10;

function outlinePoints(shape: NodeShape, w: number, h: number, r: number): Pt[] {
  const pts: Pt[] = [];
  if (shape === "ellipse") {
    const n = Math.max(18, Math.min(48, Math.round((w + h) / 9)));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push([w / 2 + (w / 2) * Math.cos(a), h / 2 + (h / 2) * Math.sin(a)]);
    }
    return pts;
  }
  r = Math.min(r, w / 2, h / 2);
  const step = 16;
  const side = (x1: number, y1: number, x2: number, y2: number) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const k = Math.max(1, Math.round(len / step));
    for (let i = 0; i < k; i++) pts.push([x1 + ((x2 - x1) * i) / k, y1 + ((y2 - y1) * i) / k]);
  };
  const arc = (cx: number, cy: number, a0: number) => {
    const k = r > 2 ? 4 : 1;
    for (let i = 0; i < k; i++) {
      const a = a0 + ((Math.PI / 2) * i) / k;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  };
  side(r, 0, w - r, 0);
  arc(w - r, r, -Math.PI / 2);
  side(w, r, w, h - r);
  arc(w - r, h - r, 0);
  side(w - r, h, r, h);
  arc(r, h - r, Math.PI / 2);
  side(0, h - r, 0, r);
  arc(r, r, Math.PI);
  return pts;
}

/** Kurva tertutup halus (Catmull-Rom → Bézier) lewat titik-titik. */
function closedSmooth(p: Pt[]): string {
  const n = p.length;
  let d = `M${f(p[0][0])},${f(p[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = p[(i - 1 + n) % n],
      p1 = p[i],
      p2 = p[(i + 1) % n],
      p3 = p[(i + 2) % n];
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])},${f(p2[1])}`;
  }
  return d + "Z";
}

function wobble(base: Pt[], rnd: () => number, amp: number, cx: number, cy: number, grow = 0): Pt[] {
  return base.map(([x, y]) => {
    const dx = x - cx,
      dy = y - cy;
    const L = Math.hypot(dx, dy) || 1;
    const j = (rnd() - 0.5) * 2 * amp + grow;
    return [x + (dx / L) * j, y + (dy / L) * j] as Pt;
  });
}

export interface SketchGeom {
  fill: string; // tepi isi (bergoyang)
  outline: string; // garis tepi utama
  outline2: string; // goresan kedua (tumpang tindih seperti coretan)
  hatch: string; // coretan arsir
}

const cache = new Map<string, SketchGeom>();

export function sketchGeom(id: string, kind: PatternId, shape: NodeShape, w: number, h: number, r: number): SketchGeom {
  const key = [id, kind, shape, Math.round(w), Math.round(h), Math.round(r)].join("|");
  const hit = cache.get(key);
  if (hit) return hit;
  const rnd = rng(hash(key));
  const base = outlinePoints(shape, w, h, r);
  const amp = Math.min(1.6, Math.min(w, h) / 22 + 0.4);
  const cx = w / 2,
    cy = h / 2;
  const fill = closedSmooth(wobble(base, rnd, amp, cx, cy));
  const outline = closedSmooth(wobble(base, rnd, amp, cx, cy));
  const outline2 = closedSmooth(wobble(base, rnd, amp * 1.4, cx, cy, Math.min(3, Math.min(w, h) / 12)));

  // coretan arsir: garis-garis sedikit bergoyang dengan panjang acak
  const strokes: string[] = [];
  const gap = Math.max(5, Math.min(8, Math.min(w, h) / 6));
  const addLine = (x1: number, y1: number, x2: number, y2: number) => {
    const mx = (x1 + x2) / 2 + (rnd() - 0.5) * 2.4,
      my = (y1 + y2) / 2 + (rnd() - 0.5) * 2.4;
    strokes.push(`M${f(x1)},${f(y1)}Q${f(mx)},${f(my)} ${f(x2)},${f(y2)}`);
  };
  const diag = (dir: 1 | -1) => {
    const span = w + h;
    for (let t = -h; t < w + h; t += gap) {
      const jx = (rnd() - 0.5) * 2.4;
      const x1 = t + jx;
      if (dir === 1) addLine(x1, h + 3, x1 + h + 6, -3);
      else addLine(x1 + h + 6, h + 3, x1, -3);
      void span;
    }
  };
  if (kind === "sk-diag" || kind === "sk-cross") diag(1);
  if (kind === "sk-diag2" || kind === "sk-cross") diag(-1);
  if (kind === "sk-horiz") {
    for (let y = gap / 2; y < h; y += gap * 0.9) addLine(-3, y + (rnd() - 0.5) * 2, w + 3, y + (rnd() - 0.5) * 2);
  }
  const out: SketchGeom = { fill, outline, outline2, hatch: strokes.join("") };
  if (cache.size > 4000) cache.clear();
  cache.set(key, out);
  return out;
}
