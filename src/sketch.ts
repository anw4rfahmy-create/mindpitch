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

/** Kurva terbuka halus (Catmull-Rom) — goresan kedua yang menumpuk dan sedikit melampaui bentuk. */
function openSmooth(p: Pt[]): string {
  const n = p.length;
  let d = `M${f(p[0][0])},${f(p[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = p[Math.max(0, i - 1)],
      p1 = p[i],
      p2 = p[i + 1],
      p3 = p[Math.min(n - 1, i + 2)];
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
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
  const amp = Math.min(2.2, Math.min(w, h) / 16 + 0.5);
  const cx = w / 2,
    cy = h / 2;
  const fill = closedSmooth(wobble(base, rnd, amp, cx, cy));
  const outline = closedSmooth(wobble(base, rnd, amp, cx, cy));
  // goresan kedua: berputar sekali lebih, mulai di dalam lalu melebar keluar (seperti coretan spidol)
  const n0 = base.length;
  const start = Math.floor(rnd() * n0);
  const G = Math.min(5, Math.min(w, h) / 7) + 1.5;
  const extra = Math.max(3, Math.round(n0 * 0.12));
  const sp: Pt[] = [];
  for (let i = 0; i <= n0 + extra; i++) {
    const [x, y] = base[(start + i) % n0];
    const dx = x - cx,
      dy = y - cy;
    const L = Math.hypot(dx, dy) || 1;
    const k = -1 + (i / (n0 + extra)) * (G + 1) + (rnd() - 0.5) * amp * 1.2;
    sp.push([x + (dx / L) * k, y + (dy / L) * k]);
  }
  const outline2 = openSmooth(sp);

  // coretan arsir: goresan putus-putus, panjang & jarak acak, sedikit melengkung (seperti coretan tangan)
  const strokes: string[] = [];
  const gap = Math.max(5.5, Math.min(8, Math.min(w, h) / 6));
  const addBroken = (x1: number, y1: number, x2: number, y2: number) => {
    if (rnd() < 0.14) return;
    let t = rnd() * 0.2;
    while (t < 1) {
      const t2 = Math.min(1, t + 0.2 + rnd() * 0.55);
      const ax = x1 + (x2 - x1) * t,
        ay = y1 + (y2 - y1) * t,
        bx = x1 + (x2 - x1) * t2,
        by = y1 + (y2 - y1) * t2;
      const bow = (rnd() - 0.5) * 2.6;
      const nx = -(y2 - y1),
        ny = x2 - x1;
      const nl = Math.hypot(nx, ny) || 1;
      strokes.push(`M${f(ax)},${f(ay)}Q${f((ax + bx) / 2 + (nx / nl) * bow)},${f((ay + by) / 2 + (ny / nl) * bow)} ${f(bx)},${f(by)}`);
      t = t2 + 0.06 + rnd() * 0.3;
    }
  };
  const diag = (dir: 1 | -1) => {
    for (let t = -h; t < w + h; t += gap) {
      const x1 = t + (rnd() - 0.5) * 2.6;
      const sk = (rnd() - 0.5) * 5;
      if (dir === 1) addBroken(x1 - 2, h + 3, x1 + h + 6 + sk, -3);
      else addBroken(x1 + h + 6 + sk, h + 3, x1 - 2, -3);
    }
  };
  if (kind === "sk-diag" || kind === "sk-cross") diag(1);
  if (kind === "sk-diag2" || kind === "sk-cross") diag(-1);
  if (kind === "sk-horiz") {
    for (let y = gap / 2; y < h; y += gap * 0.9) addBroken(-3, y + (rnd() - 0.5) * 2, w + 3, y + (rnd() - 0.5) * 2);
  }
  const out: SketchGeom = { fill, outline, outline2, hatch: strokes.join("") };
  if (cache.size > 4000) cache.clear();
  cache.set(key, out);
  return out;
}
