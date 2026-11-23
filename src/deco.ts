// Hiasan topik: penanda, stiker, tugas, tautan, label, persamaan; juga Batas dan Hubungan.
import type { LayoutResult, LNode } from "./layout";
import { styleFor } from "./nodeStyle";
import { MNode, Sheet } from "./types";

export const GLYPH_FONT = "15px system-ui, 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif";
export const CHIP_FONT = "600 11px system-ui, sans-serif";
export const EQ_FONT = "italic 15px 'Times New Roman', 'Noto Serif', serif";
export const ROW_H = 22;
export const CHIP_H = 18;
export const EQ_H = 24;

export const MARKER_GROUPS: { title: string; items: string[] }[] = [
  { title: "Penting", items: ["⭐", "🚩", "❗", "❓", "💡", "⚠️", "🎯", "📌", "🔥", "⏰"] },
  { title: "Status", items: ["✅", "❌", "👍", "👎", "🔄", "⏳", "🔒", "🔔"] },
  { title: "Prioritas", items: ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"] },
  { title: "Simbol", items: ["❤️", "💎", "🌟", "➕", "➖", "➡️", "⬅️", "⬆️", "⬇️", "✔️", "©️", "♻️"] },
];
export const STICKER_ITEMS = ["😀", "😃", "🙂", "😍", "🤔", "😎", "🤩", "😅", "😢", "😡", "🥳", "😴", "👏", "🙏", "💪", "👀", "🎉", "🎁", "🏆", "🥇", "🎈", "🌈", "☀️", "🌙", "⭐", "🌸", "🍀", "🔥", "💧", "⚡"];
export const ILLUSTRATION_ITEMS = ["📖", "📚", "✏️", "🖊️", "📝", "📐", "🧮", "🔬", "🔭", "🧪", "💻", "📱", "🕌", "🕋", "🌙", "🏫", "🎓", "🧠", "🗝️", "🧭", "🗺️", "📊", "📈", "🧩", "💡", "🔍", "⚖️", "🌍", "🏠", "🚀"];

export interface Glyph {
  kind: "marker" | "sticker" | "task" | "link" | "audio";
  text: string;
  x: number; // tengah glyph, relatif ke topik
  w: number;
}
export interface Chip {
  text: string;
  x: number;
  w: number;
}
export interface Deco {
  glyphs: Glyph[];
  glyphY: number; // tengah baris glyph
  chips: Chip[];
  chipsY: number; // tengah baris label
  eq?: string;
  eqY: number;
}

export const taskGlyph = (pct: number) => (pct >= 100 ? "✅" : pct <= 0 ? "⬜" : `🟨 ${pct}%`);

export function rawGlyphs(n: MNode): { kind: Glyph["kind"]; text: string }[] {
  const g: { kind: Glyph["kind"]; text: string }[] = [];
  for (const m of n.markers ?? []) g.push({ kind: "marker", text: m });
  for (const s of n.stickers ?? []) g.push({ kind: "sticker", text: s });
  if (n.task !== undefined) g.push({ kind: "task", text: taskGlyph(n.task) });
  if (n.link) g.push({ kind: "link", text: "🔗" });
  if (n.audio) g.push({ kind: "audio", text: "🔊" });
  return g;
}

/** Persamaan sederhana ditulis dengan sintaks mirip LaTeX → teks Unicode. */
export function eqToText(src: string): string {
  const sup: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", n: "ⁿ", x: "ˣ", i: "ⁱ" };
  const sub: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋", n: "ₙ", x: "ₓ", i: "ᵢ" };
  const greek: Record<string, string> = { alpha: "α", beta: "β", gamma: "γ", delta: "δ", theta: "θ", lambda: "λ", mu: "μ", pi: "π", sigma: "σ", omega: "ω", Delta: "Δ", Sigma: "Σ", Omega: "Ω", infty: "∞", times: "×", cdot: "·", pm: "±", leq: "≤", geq: "≥", neq: "≠", approx: "≈", rightarrow: "→", sum: "∑", int: "∫", sqrt: "√" };
  let s = src;
  for (let i = 0; i < 3; i++) s = s.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "($1)/($2)");
  s = s.replace(/\\sqrt\{([^{}]*)\}/g, "√($1)");
  s = s.replace(/\\([a-zA-Z]+)/g, (m, k) => greek[k] ?? m);
  s = s.replace(/\^\{([^{}]*)\}|\^(\w)/g, (_m, a, b) => [...(a ?? b)].map((c) => sup[c] ?? c).join(""));
  s = s.replace(/_\{([^{}]*)\}|_(\w)/g, (_m, a, b) => [...(a ?? b)].map((c) => sub[c] ?? c).join(""));
  return s.replace(/[{}]/g, "");
}

export const hasDeco = (n: MNode) => rawGlyphs(n).length > 0 || !!n.labels?.length || !!n.eq;

/** Hitung tata letak baris hiasan di dalam topik berlebar `w`; `tw` mengukur teks. */
export function layoutDeco(n: MNode, tw: (font: string, t: string) => number): { rowW: number; topH: number; bottomH: number; build: (w: number, top: number, textBottom: number) => Deco } {
  const raw = rawGlyphs(n);
  const gl = raw.map((g) => ({ ...g, w: Math.max(22, Math.ceil(tw(GLYPH_FONT, g.text)) + 8) }));
  const glW = gl.reduce((a, g) => a + g.w, 0);
  const labels = (n.labels ?? []).filter(Boolean);
  const ch = labels.map((t) => ({ text: t, w: Math.ceil(tw(CHIP_FONT, t)) + 14 }));
  const chW = ch.reduce((a, c) => a + c.w + 4, -4);
  const eq = n.eq ? eqToText(n.eq) : undefined;
  const eqW = eq ? Math.ceil(tw(EQ_FONT, eq)) : 0;
  const topH = gl.length ? ROW_H + 2 : 0;
  const bottomH = (ch.length ? CHIP_H + 6 : 0) + (eq ? EQ_H + 2 : 0);
  return {
    rowW: Math.max(glW, chW < 0 ? 0 : chW, eqW),
    topH,
    bottomH,
    build: (w, top, textBottom) => {
      let x = (w - glW) / 2;
      const glyphs: Glyph[] = gl.map((g) => {
        const o = { kind: g.kind, text: g.text, x: x + g.w / 2, w: g.w };
        x += g.w;
        return o;
      });
      let cx = (w - chW) / 2;
      const chips: Chip[] = ch.map((c) => {
        const o = { text: c.text, x: cx, w: c.w };
        cx += c.w + 4;
        return o;
      });
      const chipsY = textBottom + 4 + CHIP_H / 2;
      return { glyphs, glyphY: top + ROW_H / 2, chips, chipsY, eq, eqY: textBottom + (ch.length ? CHIP_H + 6 : 0) + 2 + EQ_H / 2 };
    },
  };
}

// ---------------------------------------------------------------- Batas
export interface BoundaryRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}
export function boundaryRects(sheet: Sheet, lay: LayoutResult): BoundaryRect[] {
  const out: BoundaryRect[] = [];
  const PAD = 12;
  for (const id of lay.order) {
    const n = sheet.nodes[id];
    if (!n?.boundary || !lay.nodes[id]) continue;
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    const stack = [id];
    while (stack.length) {
      const c = stack.pop()!;
      const ln = lay.nodes[c];
      if (!ln) continue;
      x0 = Math.min(x0, ln.x);
      y0 = Math.min(y0, ln.y);
      x1 = Math.max(x1, ln.x + ln.w + (ln.badge && ln.side === "r" ? 22 : 0));
      y1 = Math.max(y1, ln.y + ln.h);
      for (const k of sheet.nodes[c].children) stack.push(k);
    }
    if (!isFinite(x0)) continue;
    out.push({ id, x: x0 - PAD, y: y0 - PAD, w: x1 - x0 + PAD * 2, h: y1 - y0 + PAD * 2, color: styleFor(sheet, n, lay.nodes[id].depth).branch });
  }
  return out;
}

// ---------------------------------------------------------------- Hubungan
export interface RelGeom {
  id: string;
  d: string;
  arrow: string;
  lx: number;
  ly: number;
  label?: string;
  color: string;
}
function visibleAnc(sheet: Sheet, lay: LayoutResult, id: string): LNode | null {
  let cur: string | null = id;
  while (cur) {
    if (lay.nodes[cur]) return lay.nodes[cur];
    cur = sheet.nodes[cur]?.parentId ?? null;
  }
  return null;
}
function edgePoint(a: LNode, tx: number, ty: number): [number, number] {
  const cx = a.x + a.w / 2,
    cy = a.y + a.h / 2;
  const dx = tx - cx,
    dy = ty - cy;
  if (!dx && !dy) return [cx, cy];
  const s = Math.min(a.w / 2 / (Math.abs(dx) || 1e-6), a.h / 2 / (Math.abs(dy) || 1e-6));
  return [cx + dx * s, cy + dy * s];
}
export function relationGeoms(sheet: Sheet, lay: LayoutResult): RelGeom[] {
  const out: RelGeom[] = [];
  for (const r of sheet.relations ?? []) {
    const a = visibleAnc(sheet, lay, r.from),
      b = visibleAnc(sheet, lay, r.to);
    if (!a || !b || a === b) continue;
    const ac = [a.x + a.w / 2, a.y + a.h / 2],
      bc = [b.x + b.w / 2, b.y + b.h / 2];
    const dist = Math.hypot(bc[0] - ac[0], bc[1] - ac[1]) || 1;
    const mx = (ac[0] + bc[0]) / 2,
      my = (ac[1] + bc[1]) / 2;
    const off = Math.min(120, dist * 0.28);
    const px = -(bc[1] - ac[1]) / dist,
      py = (bc[0] - ac[0]) / dist;
    const cx = mx + px * off,
      cy = my + py * off;
    const s = edgePoint(a, cx, cy),
      e = edgePoint(b, cx, cy);
    const ang = Math.atan2(e[1] - cy, e[0] - cx);
    const L = 11;
    const p1: [number, number] = [e[0] - L * Math.cos(ang - 0.45), e[1] - L * Math.sin(ang - 0.45)];
    const p2: [number, number] = [e[0] - L * Math.cos(ang + 0.45), e[1] - L * Math.sin(ang + 0.45)];
    const f = (v: number) => Math.round(v * 10) / 10;
    out.push({
      id: r.id,
      d: `M${f(s[0])},${f(s[1])}Q${f(cx)},${f(cy)} ${f(e[0])},${f(e[1])}`,
      arrow: `M${f(p1[0])},${f(p1[1])}L${f(e[0])},${f(e[1])}L${f(p2[0])},${f(p2[1])}`,
      lx: 0.25 * s[0] + 0.5 * cx + 0.25 * e[0],
      ly: 0.25 * s[1] + 0.5 * cy + 0.25 * e[1],
      label: r.label,
      color: r.color || "#e11d48",
    });
  }
  return out;
}
