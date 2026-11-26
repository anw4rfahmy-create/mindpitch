// Lembar Diagram Venn: geometri, primitif gambar (dipakai kanvas & SVG), dan operasi data.
import { ensureFonts, familyCss, fontString, isRtl } from "./fonts";
import { textWidth, wrapCached } from "./measure";
import { Sheet, VennData, VennDiagram, VennLayout } from "./types";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const VENN_COLORS = ["#ef4444", "#3b82f6", "#10b981"];
export const VENN_PALETTE = ["#ef4444", "#f97316", "#eab308", "#10b981", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#64748b"];

export const VENN_LAYOUTS: { id: VennLayout; label: string; sub: string }[] = [
  { id: "overlap", label: "Beririsan", sub: "dua lingkaran beririsan sebagian" },
  { id: "same", label: "Sama", sub: "dua lingkaran bertumpuk penuh" },
  { id: "apart", label: "Terpisah", sub: "dua lingkaran tidak bersinggungan" },
  { id: "inside", label: "Di dalam", sub: "satu lingkaran di dalam yang lain" },
  { id: "three", label: "Tiga lingkaran", sub: "tiga lingkaran beririsan" },
];

export const BLOCK_W = 600;
const TITLE_H = 56;
const BODY_H = 450;
export const BLOCK_H = TITLE_H + BODY_H;
const GAP = 40;

interface Circle {
  set: number;
  cx: number;
  cy: number;
  r: number;
}
interface Anchor {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Spec {
  circles: Circle[];
  anchors: Record<string, Anchor>;
  labels: { x: number; y: number }[]; // posisi nama himpunan
}

const SPECS: Record<VennLayout, Spec> = {
  overlap: {
    circles: [
      { set: 0, cx: 225, cy: 250, r: 150 },
      { set: 1, cx: 375, cy: 250, r: 150 },
    ],
    anchors: {
      a: { x: 160, y: 250, w: 120, h: 190 },
      ab: { x: 300, y: 250, w: 100, h: 190 },
      b: { x: 440, y: 250, w: 120, h: 190 },
    },
    labels: [
      { x: 190, y: 64 },
      { x: 410, y: 64 },
    ],
  },
  same: {
    circles: [
      { set: 0, cx: 300, cy: 255, r: 165 },
      { set: 1, cx: 300, cy: 255, r: 165 },
    ],
    anchors: { ab: { x: 300, y: 255, w: 240, h: 220 } },
    labels: [
      { x: 170, y: 52 },
      { x: 430, y: 52 },
    ],
  },
  apart: {
    circles: [
      { set: 0, cx: 150, cy: 255, r: 125 },
      { set: 1, cx: 450, cy: 255, r: 125 },
    ],
    anchors: {
      a: { x: 150, y: 255, w: 190, h: 190 },
      b: { x: 450, y: 255, w: 190, h: 190 },
    },
    labels: [
      { x: 150, y: 90 },
      { x: 450, y: 90 },
    ],
  },
  inside: {
    circles: [
      { set: 1, cx: 300, cy: 245, r: 195 },
      { set: 0, cx: 300, cy: 318, r: 100 },
    ],
    anchors: {
      b: { x: 300, y: 125, w: 250, h: 100 },
      ab: { x: 300, y: 336, w: 160, h: 110 },
    },
    labels: [
      { x: 300, y: 262 }, // nama himpunan 0 (kecil, di dalam)
      { x: 300, y: 28 }, // nama himpunan 1 (besar, di atas)
    ],
  },
  three: {
    circles: [
      { set: 0, cx: 240, cy: 200, r: 140 },
      { set: 1, cx: 360, cy: 200, r: 140 },
      { set: 2, cx: 300, cy: 300, r: 140 },
    ],
    anchors: {
      a: { x: 178, y: 160, w: 100, h: 110 },
      b: { x: 422, y: 160, w: 100, h: 110 },
      c: { x: 300, y: 382, w: 150, h: 70 },
      ab: { x: 300, y: 128, w: 86, h: 80 },
      ac: { x: 232, y: 278, w: 76, h: 70 },
      bc: { x: 368, y: 278, w: 76, h: 70 },
      abc: { x: 300, y: 227, w: 70, h: 56 },
    },
    labels: [
      { x: 150, y: 30 },
      { x: 450, y: 30 },
      { x: 300, y: 446 },
    ],
  },
};

export const regionKeys = (layout: VennLayout) => Object.keys(SPECS[layout].anchors);
export const setCount = (layout: VennLayout) => (layout === "three" ? 3 : 2);
export const vennSpec = (layout: VennLayout) => SPECS[layout];

const L = (i: number) => "ABC"[i];
export function regionName(layout: VennLayout, key: string, d: VennDiagram): string {
  const nm = (i: number) => d.sets[i]?.name?.trim() || L(i);
  const idx = key.split("").map((c) => c.charCodeAt(0) - 97);
  if (layout === "inside") return key === "ab" ? `${nm(0)} (di dalam ${nm(1)})` : `Hanya ${nm(1)}`;
  if (layout === "same") return `${nm(0)} = ${nm(1)}`;
  if (idx.length === 1) return `Hanya ${nm(idx[0])}`;
  return "Irisan " + idx.map(nm).join(" & ");
}

/** Himpunan tempat sebuah titik (koordinat lokal badan diagram) berada → kunci wilayah. */
export function regionAt(layout: VennLayout, x: number, y: number): string | null {
  const mem = new Set<number>();
  for (const c of SPECS[layout].circles) if ((x - c.cx) ** 2 + (y - c.cy) ** 2 <= c.r * c.r) mem.add(c.set);
  if (!mem.size) return null;
  const key = [...mem].sort().map((i) => String.fromCharCode(97 + i)).join("");
  return key in SPECS[layout].anchors ? key : null;
}

export function newDiagram(layout: VennLayout = "overlap"): VennDiagram {
  return {
    title: "",
    layout,
    sets: [
      { name: "", color: VENN_COLORS[0] },
      { name: "", color: VENN_COLORS[1] },
      { name: "", color: VENN_COLORS[2] },
    ],
    text: {},
  };
}

export function defaultVenn(): VennData {
  return { diagrams: [newDiagram("overlap")], cols: 1, font: "system", arFont: "amiri", fontSize: 22 };
}

export function normalizeVenn(v: any): VennData {
  const base = defaultVenn();
  const diagrams: VennDiagram[] = (Array.isArray(v?.diagrams) && v.diagrams.length ? v.diagrams : base.diagrams).slice(0, 8).map((d: any) => ({
    title: String(d?.title ?? ""),
    layout: (d?.layout in SPECS ? d.layout : "overlap") as VennLayout,
    sets: [0, 1, 2].map((i) => ({ name: String(d?.sets?.[i]?.name ?? ""), color: String(d?.sets?.[i]?.color ?? VENN_COLORS[i]) })),
    text: d?.text && typeof d.text === "object" ? { ...d.text } : {},
  }));
  return {
    diagrams,
    cols: v?.cols === 2 ? 2 : 1,
    font: String(v?.font ?? base.font),
    arFont: String(v?.arFont ?? base.arFont),
    fontSize: Math.min(48, Math.max(12, Number(v?.fontSize) || base.fontSize)),
  };
}

export interface VBlock {
  x: number;
  y: number;
  w: number;
  h: number;
  i: number;
}
export function vennBlocks(v: VennData): { blocks: VBlock[]; w: number; h: number } {
  const cols = Math.min(v.cols, v.diagrams.length) || 1;
  const rows = Math.ceil(v.diagrams.length / cols);
  const blocks = v.diagrams.map((_, i) => ({ x: (i % cols) * (BLOCK_W + GAP), y: Math.floor(i / cols) * (BLOCK_H + GAP), w: BLOCK_W, h: BLOCK_H, i }));
  return { blocks, w: cols * BLOCK_W + (cols - 1) * GAP, h: rows * BLOCK_H + (rows - 1) * GAP };
}

export type VPrim =
  | { t: "circle"; cx: number; cy: number; r: number; fill: string; stroke: string }
  | { t: "text"; x: number; y: number; lines: string[]; size: number; lineH: number; bold: boolean; color: string; font: string; rtl: boolean };

const darker = (hex: string) => {
  const n = parseInt(hex.replace("#", ""), 16);
  const f = (v: number) => Math.round(v * 0.62);
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

/** Teks diatur ke dalam kotak: ukuran huruf dikecilkan otomatis sampai muat. */
function fitText(v: VennData, text: string, a: Anchor, bold = false) {
  const rtl = isRtl(text);
  const fontId = rtl ? v.arFont : v.font;
  let size = v.fontSize;
  let lines: string[] = [];
  let lineH = 0;
  for (; size >= 9; size -= 1) {
    const fs = fontString(fontId, bold ? 700 : 400, size);
    lines = text.split("\n").flatMap((p) => wrapCached(fs, p, a.w));
    lineH = Math.round(size * (rtl ? 1.7 : 1.35));
    if (lines.length * lineH <= a.h && lines.every((l) => textWidth(fs, l) <= a.w + 1)) break;
  }
  return { lines, size, lineH, rtl, fontId };
}

/** Semua bentuk satu diagram dalam koordinat lokal blok. `reveal`: kunci "d:wilayah" yang boleh tampil (null = semua). */
export function diagramPrims(v: VennData, di: number, reveal: Set<string> | null = null): VPrim[] {
  const d = v.diagrams[di];
  const spec = SPECS[d.layout];
  const out: VPrim[] = [];
  const oy = TITLE_H;
  if (d.title.trim()) {
    const f = fitText({ ...v, fontSize: Math.round(v.fontSize * 1.3) }, d.title, { x: BLOCK_W / 2, y: 0, w: BLOCK_W - 40, h: 44 }, true);
    out.push({ t: "text", x: BLOCK_W / 2, y: 26, lines: f.lines.slice(0, 1), size: f.size, lineH: f.lineH, bold: true, color: "#0f172a", font: f.fontId, rtl: f.rtl });
  }
  for (const c of spec.circles) out.push({ t: "circle", cx: c.cx, cy: c.cy + oy, r: c.r, fill: d.sets[c.set].color + "55", stroke: d.sets[c.set].color });
  // nama himpunan
  spec.labels.forEach((lb, i) => {
    if (i >= setCount(d.layout)) return;
    const name = d.sets[i].name.trim() || L(i);
    const f = fitText(v, name, { x: lb.x, y: lb.y, w: d.layout === "three" ? 200 : 230, h: 40 }, true);
    out.push({ t: "text", x: lb.x, y: lb.y + oy, lines: f.lines.slice(0, 1), size: f.size, lineH: f.lineH, bold: true, color: darker(d.sets[i].color), font: f.fontId, rtl: f.rtl });
  });
  for (const key of Object.keys(spec.anchors)) {
    const txt = (d.text[key] ?? "").trim();
    if (!txt) continue;
    if (reveal && !reveal.has(di + ":" + key)) continue;
    const a = spec.anchors[key];
    const f = fitText(v, txt, a);
    out.push({ t: "text", x: a.x, y: a.y + oy, lines: f.lines, size: f.size, lineH: f.lineH, bold: false, color: "#0f172a", font: f.fontId, rtl: f.rtl });
  }
  return out;
}

/** Urutan tampil untuk presentasi bertahap: diagram demi diagram, wilayah demi wilayah. */
export function revealOrder(v: VennData): string[] {
  const out: string[] = [];
  v.diagrams.forEach((d, i) => {
    const order = d.layout === "three" ? ["a", "b", "c", "ab", "ac", "bc", "abc"] : regionKeys(d.layout);
    for (const k of order) if ((d.text[k] ?? "").trim()) out.push(i + ":" + k);
  });
  return out;
}

export async function ensureVennFonts(sheet: Sheet) {
  if (sheet.venn) await ensureFonts([sheet.venn.font, sheet.venn.arFont]);
}

export function vennGeom(sheet: Sheet) {
  return vennBlocks(sheet.venn!);
}

export function drawVenn(ctx: CanvasRenderingContext2D, sheet: Sheet, reveal: Set<string> | null = null) {
  const v = sheet.venn!;
  const { blocks } = vennBlocks(v);
  for (const b of blocks) {
    ctx.save();
    ctx.translate(b.x, b.y);
    for (const p of diagramPrims(v, b.i, reveal)) {
      if (p.t === "circle") {
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.fill;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = p.stroke;
        ctx.stroke();
      } else {
        ctx.font = fontString(p.font, p.bold ? 700 : 400, p.size);
        ctx.fillStyle = p.color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.direction = p.rtl ? "rtl" : "ltr";
        const y0 = p.y - ((p.lines.length - 1) * p.lineH) / 2;
        p.lines.forEach((l, i) => ctx.fillText(l, p.x, y0 + i * p.lineH));
      }
    }
    ctx.restore();
  }
}

export function vennSvg(sheet: Sheet, reveal: Set<string> | null = null): string {
  const v = sheet.venn!;
  const { blocks } = vennBlocks(v);
  const P: string[] = [];
  for (const b of blocks) {
    P.push(`<g transform="translate(${b.x},${b.y})">`);
    for (const p of diagramPrims(v, b.i, reveal)) {
      if (p.t === "circle") P.push(`<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="3"/>`);
      else {
        const y0 = p.y - ((p.lines.length - 1) * p.lineH) / 2;
        p.lines.forEach((l, i) =>
          P.push(
            `<text x="${p.x}" y="${y0 + i * p.lineH}" text-anchor="middle" dominant-baseline="central" direction="${p.rtl ? "rtl" : "ltr"}" fill="${p.color}" font-family="${familyCss(p.font).replace(/"/g, "'")}" font-size="${p.size}" font-weight="${p.bold ? 700 : 400}">${esc(l)}</text>`
          )
        );
      }
    }
    P.push("</g>");
  }
  return P.join("");
}

export function vennToMarkdown(sheet: Sheet): string {
  const v = sheet.venn!;
  const out: string[] = [`# ${sheet.title}`, ""];
  v.diagrams.forEach((d, i) => {
    out.push(`## ${d.title.trim() || "Diagram " + (i + 1)}`);
    for (const k of regionKeys(d.layout)) {
      const t = (d.text[k] ?? "").trim();
      if (t) out.push(`- **${regionName(d.layout, k, d)}**: ${t.replace(/\n/g, "; ")}`);
    }
    out.push("");
  });
  return out.join("\n");
}
