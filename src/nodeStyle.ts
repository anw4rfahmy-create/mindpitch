import { BRANCH_PALETTE, Nodes, branchColor } from "./model";
import { NodeShape } from "./types";

export interface NodeStyle {
  fill: string; // "none" untuk gaya garis
  stroke: string;
  strokeWidth: number;
  text: string;
  shape: NodeShape;
  branch: string;
  radius: (h: number) => number;
}

export function contrastText(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#0f172a";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#0f172a" : "#ffffff";
}

const radiusFor = (shape: NodeShape) => (h: number) =>
  shape === "pill" ? h / 2 : shape === "box" ? 3 : shape === "line" ? 0 : 10;

export function styleFor(
  nodes: Nodes,
  rootId: string,
  id: string,
  depth: number,
  palette: string[] = BRANCH_PALETTE
): NodeStyle {
  const n = nodes[id];
  const branch = depth === 0 ? "#4f46e5" : branchColor(nodes, rootId, id, palette);
  const shape: NodeShape = n.shape ?? (depth === 0 ? "pill" : "rounded");
  let fill: string, stroke: string, text: string, strokeWidth = 1.5;

  if (depth === 0) {
    fill = n.color ?? "#4f46e5";
    stroke = fill;
    text = contrastText(fill);
  } else if (depth === 1) {
    fill = n.color ?? branch;
    stroke = fill;
    text = contrastText(fill);
  } else {
    fill = n.color ?? "#ffffff";
    stroke = n.color ?? branch;
    text = contrastText(fill);
  }

  if (shape === "line") {
    // gaya garis bawah: tanpa isi, teks berwarna gelap
    fill = "none";
    text = "#0f172a";
    stroke = n.color ?? branch;
    strokeWidth = 2;
  }
  return { fill, stroke, strokeWidth, text, shape, branch, radius: radiusFor(shape) };
}

export const NODE_COLORS = [
  "#6366f1",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#0ea5e9",
  "#8b5cf6",
  "#ef4444",
  "#14b8a6",
  "#64748b",
  "#0f172a",
  "#ffffff",
  "#fde68a",
];
