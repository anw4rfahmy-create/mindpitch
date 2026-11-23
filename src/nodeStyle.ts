import { branchIndex } from "./model";
import { paletteById } from "./themes";
import { isSketch } from "./sketch";
import { MNode, NodeShape, PatternId, Sheet, StructureId } from "./types";

export interface NodeStyle {
  fill: string; // "none" bila tanpa isi
  stroke: string; // "none" bila tanpa garis
  strokeWidth: number;
  text: string;
  shape: NodeShape;
  branch: string;
  pattern?: Exclude<PatternId, "none">;
  patternColor: string;
  dash?: string; // pola putus-putus garis tepi
}

export function contrastText(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#0f172a";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "#0f172a" : "#ffffff";
}

export function branchColorOf(sheet: Sheet, id: string): string {
  if (id === sheet.rootId) return "#334155";
  const sm = sheet.nodes[id]?.summary;
  if (sm && sheet.nodes[sm.from]) id = sm.from;
  const pal = paletteById(sheet.theme).colors;
  if (!sheet.colored) return pal[0];
  return pal[branchIndex(sheet.nodes, sheet.rootId, id) % pal.length];
}

/** Bentuk bawaan topik menurut gaya peta, kedalaman, dan struktur. */
export function defaultShape(sheet: Sheet, depth: number): NodeShape {
  const ts = sheet.topicStyle;
  if (depth === 0) return "rounded";
  if (ts === "box") return "rounded";
  if (ts === "pill") return "pill";
  if (ts === "line") return "line";
  if (ts === "none") return depth === 1 ? "rounded" : "none";
  // otomatis (gaya klasik): topik utama berwarna, sub-topik teks di atas garis
  if (sheet.structure === "org-down" || sheet.structure === "org-up") return depth === 1 ? "rounded" : "box";
  return depth === 1 ? "rounded" : "line";
}

/** Warna teks untuk topik tanpa isi: kontras terhadap warna latar peta. */
function plainText(sheet: Sheet): string {
  return contrastText(sheet.bg.color);
}

export function patternOf(sheet: Sheet, n: MNode, depth: number): Exclude<PatternId, "none"> | undefined {
  const p = n.pattern ?? (depth > 0 ? sheet.pattern : undefined);
  return !p || p === "none" ? undefined : p;
}

/** Bentuk akhir topik: topik berarsir tidak boleh polos/garis agar arsirnya terlihat. */
export function effectiveShape(sheet: Sheet, n: MNode, depth: number): NodeShape {
  const s: NodeShape = n.shape ?? (n.summary ? "rounded" : defaultShape(sheet, depth));
  return (s === "line" || s === "none") && patternOf(sheet, n, depth) ? "rounded" : s;
}

export function hexA(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return `rgba(0,0,0,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function styleFor(sheet: Sheet, n: MNode, depth: number): NodeStyle {
  const branch = branchColorOf(sheet, n.id);
  const shape: NodeShape = effectiveShape(sheet, n, depth);
  const pattern = patternOf(sheet, n, depth);
  const ts = sheet.topicStyle;
  let fill: string, stroke: string, text: string, strokeWidth = 1.6;

  if (depth === 0) {
    fill = n.color ?? "#ffffff";
    stroke = n.color ?? "#1e293b";
    strokeWidth = 3;
    text = contrastText(fill);
  } else if (depth === 1 && ts !== "line") {
    fill = n.color ?? branch;
    stroke = fill;
    text = contrastText(fill);
  } else if (ts === "box" || ts === "pill" || shape === "rounded" || shape === "box" || shape === "pill" || shape === "ellipse") {
    fill = n.color ?? "#ffffff";
    stroke = n.color && n.color !== "#ffffff" ? n.color : branch;
    text = contrastText(fill);
  } else {
    fill = "none";
    stroke = n.color ?? branch;
    text = plainText(sheet);
  }

  if (shape === "line") {
    fill = "none";
    stroke = n.color ?? branch;
    strokeWidth = 2.2;
    text = plainText(sheet);
  } else if (shape === "none") {
    fill = "none";
    stroke = "none";
    text = plainText(sheet);
  }
  let patternColor = "rgba(0,0,0,0.2)";
  if (pattern) {
    if (fill === "none") {
      fill = "#ffffff";
      if (stroke === "none") stroke = branch;
      text = contrastText(fill);
    }
    const dark = contrastText(fill) === "#ffffff";
    const sk = isSketch(pattern);
    patternColor = dark
      ? `rgba(255,255,255,${sk ? 0.55 : 0.42})`
      : stroke === fill || stroke === "none"
      ? `rgba(0,0,0,${sk ? 0.3 : 0.22})`
      : hexA(stroke, sk ? 0.65 : 0.5);
  }
  let dash: string | undefined;
  if (n.edge === "none" && shape !== "line") stroke = "none";
  else if (n.edge === "dashed") dash = "7 5";
  if (n.textColor) text = n.textColor;
  return { fill, stroke, strokeWidth, text, shape, branch, pattern, patternColor, dash };
}

export function radiusFor(shape: NodeShape, h: number): number {
  switch (shape) {
    case "pill":
      return h / 2;
    case "box":
      return 3;
    case "rounded":
      return 10;
    default:
      return 0;
  }
}

export function lineStyleFor(sheet: Sheet): "curve" | "elbow" | "round" | "straight" {
  if (sheet.lineStyle !== "auto") return sheet.lineStyle;
  const s: StructureId = sheet.structure;
  if (s.startsWith("mind")) return "curve";
  if (s.startsWith("org") || s.startsWith("tree") || s === "timeline" || s === "fishbone") return "elbow";
  if (s.startsWith("logic")) return "round";
  return "curve";
}

export function edgeWidth(sheet: Sheet, depth: number): number {
  const w = sheet.lineWidth;
  if (w > 0) return Math.max(1, w - Math.max(0, depth - 1) * 0.5);
  return depth <= 1 ? 3.4 : depth === 2 ? 2.4 : 1.8;
}

export const NODE_COLORS = [
  "#e5534b",
  "#f08a5d",
  "#e8b931",
  "#3fae7f",
  "#3fb8c4",
  "#4c8bf5",
  "#9b6bdf",
  "#ec6ca5",
  "#64748b",
  "#0f172a",
  "#ffffff",
  "#fde68a",
];
