import { FONT_FAMILY, textWidth, wrapCached } from "./measure";
import { LayoutKind } from "./types";
import { Nodes } from "./model";

export type Side = "c" | "r" | "l" | "d";

export interface LNode {
  id: string;
  x: number; // kiri
  y: number; // atas
  w: number;
  h: number;
  lines: string[];
  font: string;
  fontSize: number;
  lineH: number;
  depth: number;
  side: Side;
  parentId: string | null;
  hasHidden: boolean; // punya anak yang tersembunyi (collapsed)
}

export interface LayoutResult {
  nodes: Record<string, LNode>;
  order: string[]; // urutan BFS (untuk reveal bertahap)
  bounds: { x: number; y: number; w: number; h: number };
}

const PAD_X = 14;
const PAD_Y = 9;
const MAX_TEXT_W = 200;

export function fontFor(depth: number): { font: string; size: number } {
  if (depth === 0) return { font: `700 20px ${FONT_FAMILY}`, size: 20 };
  if (depth === 1) return { font: `600 16px ${FONT_FAMILY}`, size: 16 };
  return { font: `400 14px ${FONT_FAMILY}`, size: 14 };
}

function sizeNode(text: string, depth: number) {
  const { font, size } = fontFor(depth);
  const lines = wrapCached(font, text, MAX_TEXT_W);
  const lineH = Math.round(size * 1.3);
  let widest = 0;
  for (const l of lines) widest = Math.max(widest, textWidth(font, l));
  const minW = depth === 0 ? 96 : 56;
  return {
    lines,
    font,
    fontSize: size,
    lineH,
    w: Math.max(minW, Math.ceil(widest) + PAD_X * 2),
    h: lines.length * lineH + PAD_Y * 2,
  };
}

interface Opts {
  ignoreCollapsed?: boolean;
}

export function computeLayout(
  nodes: Nodes,
  rootId: string,
  kind: LayoutKind,
  opts: Opts = {}
): LayoutResult {
  const out: Record<string, LNode> = {};
  const order: string[] = [];
  const root = nodes[rootId];
  if (!root) return { nodes: out, order, bounds: { x: 0, y: 0, w: 1, h: 1 } };

  const kids = (id: string): string[] => {
    const n = nodes[id];
    if (!n) return [];
    if (n.collapsed && !opts.ignoreCollapsed) return [];
    return n.children.filter((c) => nodes[c]);
  };

  // ukur semua node yang tampil
  const walkMeasure = (id: string, depth: number, parentId: string | null) => {
    const n = nodes[id];
    const s = sizeNode(n.text, depth);
    out[id] = {
      id,
      x: 0,
      y: 0,
      ...s,
      depth,
      side: "c",
      parentId,
      hasHidden: !!n.collapsed && !opts.ignoreCollapsed && n.children.length > 0,
    };
    kids(id).forEach((c) => walkMeasure(c, depth + 1, id));
  };
  walkMeasure(rootId, 0, null);

  const horizontalGap = 56;
  const verticalGapDepth = 46;
  const crossGapH = 14; // jarak antar saudara pada layout horizontal
  const crossGapV = 22; // jarak antar saudara pada layout vertikal

  const extMemo = new Map<string, number>();
  const ext = (id: string, vertical: boolean): number => {
    const key = id + (vertical ? "v" : "h");
    const hit = extMemo.get(key);
    if (hit !== undefined) return hit;
    const n = out[id];
    const own = vertical ? n.w : n.h;
    const ch = kids(id);
    let r = own;
    if (ch.length) {
      const gap = vertical ? crossGapV : crossGapH;
      const sum = ch.reduce((a, c) => a + ext(c, vertical), 0) + gap * (ch.length - 1);
      r = Math.max(own, sum);
    }
    extMemo.set(key, r);
    return r;
  };

  // Tempatkan node + keturunannya. depthPos = tepi awal sumbu kedalaman, crossCenter = pusat sumbu silang.
  const place = (id: string, dir: "r" | "l" | "d", depthPos: number, crossCenter: number) => {
    const n = out[id];
    n.side = dir;
    if (dir === "r") {
      n.x = depthPos;
      n.y = crossCenter - n.h / 2;
    } else if (dir === "l") {
      n.x = depthPos - n.w;
      n.y = crossCenter - n.h / 2;
    } else {
      n.y = depthPos;
      n.x = crossCenter - n.w / 2;
    }
    placeChildren(id, dir, crossCenter);
  };

  const placeChildren = (id: string, dir: "r" | "l" | "d", crossCenter: number, only?: string[]) => {
    const n = out[id];
    const ch = only ?? kids(id);
    if (!ch.length) return;
    const vertical = dir === "d";
    const gap = vertical ? crossGapV : crossGapH;
    const total = ch.reduce((a, c) => a + ext(c, vertical), 0) + gap * (ch.length - 1);
    let cur = crossCenter - total / 2;
    for (const c of ch) {
      const e = ext(c, vertical);
      const center = cur + e / 2;
      let depthPos: number;
      if (dir === "r") depthPos = n.x + n.w + horizontalGap;
      else if (dir === "l") depthPos = n.x - horizontalGap;
      else depthPos = n.y + n.h + verticalGapDepth;
      place(c, dir, depthPos, center);
      cur += e + gap;
    }
  };

  // root di tengah (0,0)
  const r = out[rootId];
  r.x = -r.w / 2;
  r.y = -r.h / 2;
  r.side = "c";
  const top = kids(rootId);

  if (kind === "right") {
    placeChildren(rootId, "r", 0);
  } else if (kind === "down") {
    r.x = -r.w / 2;
    r.y = 0;
    placeChildren(rootId, "d", 0);
  } else {
    // peta dua sisi: bagi cabang agar tinggi kiri dan kanan seimbang
    const total = top.reduce((a, c) => a + ext(c, false), 0);
    let acc = 0;
    const right: string[] = [];
    const left: string[] = [];
    for (const c of top) {
      const e = ext(c, false);
      if (acc + e / 2 <= total / 2 || right.length === 0) right.push(c);
      else left.push(c);
      acc += e;
    }
    placeChildren(rootId, "r", 0, right);
    placeChildren(rootId, "l", 0, left);
  }

  // urutan BFS
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    queue.push(...kids(id));
  }

  // batas
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const id in out) {
    const n = out[id];
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.w);
    maxY = Math.max(maxY, n.y + n.h);
  }
  return { nodes: out, order, bounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } };
}

/** Path SVG (juga valid untuk Path2D) dari induk ke anak. */
export function edgePath(p: LNode, c: LNode): string {
  if (c.side === "d") {
    const x1 = p.x + p.w / 2;
    const y1 = p.y + p.h;
    const x2 = c.x + c.w / 2;
    const y2 = c.y;
    const my = (y1 + y2) / 2;
    return `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
  }
  const right = c.side === "r";
  const x1 = right ? p.x + p.w : p.x;
  const y1 = p.y + p.h / 2;
  const x2 = right ? c.x : c.x + c.w;
  const y2 = c.y + c.h / 2;
  const mx = (x1 + x2) / 2;
  return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
}
