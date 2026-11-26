import { fontString, isRtl } from "./fonts";
import { textWidth, wrapCached } from "./measure";
import { effectiveShape, lineStyleFor } from "./nodeStyle";
import { NodeShape, Sheet } from "./types";
import { tableGeom } from "./table";
import { vennGeom } from "./venn";
import { boundaryRects, CHIP_FONT, Deco, EQ_FONT, GLYPH_FONT, layoutDeco } from "./deco";

export type Side = "c" | "r" | "l" | "d" | "u";

export interface LNode {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
  font: string;
  fontSize: number;
  lineH: number;
  textTop: number; // jarak dari atas topik ke baris pertama
  img?: { x: number; y: number; w: number; h: number; fileId: string };
  depth: number;
  side: Side;
  parentId: string | null;
  hasKids: boolean;
  hasHidden: boolean;
  badge?: { x: number; y: number };
  rtl: boolean;
  shape: NodeShape;
  deco?: Deco;
}

export interface LEdge {
  key: string;
  childId: string;
  d: string;
  kind: "line" | "brace" | "axis";
}

export interface LayoutResult {
  nodes: Record<string, LNode>;
  order: string[];
  edges: LEdge[];
  bounds: { x: number; y: number; w: number; h: number };
}

const IMG_W = { S: 90, M: 150, L: 230 } as const;

type Dir = "r" | "l" | "d" | "u";
type LStyle = "curve" | "elbow" | "round" | "straight";

interface Ctx {
  sheet: Sheet;
  out: Record<string, LNode>;
  kids: (id: string) => string[];
  rootId: string;
  edges: LEdge[];
  style: LStyle;
}

const anchorY = (n: LNode) => (n.shape === "line" ? n.y + n.h : n.y + n.h / 2);

export function link(style: LStyle, x1: number, y1: number, x2: number, y2: number, horiz: boolean): string {
  if (style === "straight") return `M${x1},${y1} L${x2},${y2}`;
  if (horiz) {
    const mx = (x1 + x2) / 2;
    if (style === "curve") return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
    if (Math.abs(y2 - y1) < 1) return `M${x1},${y1} L${x2},${y2}`;
    if (style === "elbow") return `M${x1},${y1} L${mx},${y1} L${mx},${y2} L${x2},${y2}`;
    const r = Math.min(10, Math.abs(y2 - y1) / 2, Math.abs(x2 - x1) / 2);
    const sx = x2 > x1 ? 1 : -1,
      sy = y2 > y1 ? 1 : -1;
    return `M${x1},${y1} L${mx - sx * r},${y1} Q${mx},${y1} ${mx},${y1 + sy * r} L${mx},${y2 - sy * r} Q${mx},${y2} ${mx + sx * r},${y2} L${x2},${y2}`;
  }
  const my = (y1 + y2) / 2;
  if (style === "curve") return `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
  if (Math.abs(x2 - x1) < 1) return `M${x1},${y1} L${x2},${y2}`;
  if (style === "elbow") return `M${x1},${y1} L${x1},${my} L${x2},${my} L${x2},${y2}`;
  const r = Math.min(10, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2);
  const sx = x2 > x1 ? 1 : -1,
    sy = y2 > y1 ? 1 : -1;
  return `M${x1},${y1} L${x1},${my - sy * r} Q${x1},${my} ${x1 + sx * r},${my} L${x2 - sx * r},${my} Q${x2},${my} ${x2},${my + sy * r} L${x2},${y2}`;
}

/** Kurung kurawal "{" dengan ujung di x0 menunjuk ke induk; dir=1 anak di kanan, -1 di kiri. */
export function bracePath(x0: number, y1: number, y2: number, ym: number, dir: 1 | -1): string {
  const xm = x0 + dir * 8,
    x1 = x0 + dir * 16,
    r = 8;
  if (y2 - y1 < 4 * r) return `M${x0},${ym} L${x1},${ym}`;
  return (
    `M${x1},${y1} Q${xm},${y1} ${xm},${y1 + r} L${xm},${ym - r} Q${xm},${ym} ${x0},${ym} ` +
    `Q${xm},${ym} ${xm},${ym + r} L${xm},${y2 - r} Q${xm},${y2} ${x1},${y2}`
  );
}

// ---------------------------------------------------------------- ukuran topik
function measure(sheet: Sheet, id: string, depth: number): Omit<LNode, "x" | "y" | "side" | "parentId" | "hasKids" | "hasHidden" | "badge"> {
  const n = sheet.nodes[id];
  const size = n.fontSize ?? (depth === 0 ? 20 : depth === 1 ? 16 : 14);
  const bold = n.bold ?? depth <= 1;
  const font = fontString(n.font ?? sheet.font, bold ? 700 : 400, size, !!n.italic);
  const shape = effectiveShape(sheet, n, depth);
  const rtl = isRtl(n.text);
  const flat = shape === "line" || shape === "none";
  const ell = shape === "ellipse";
  const padX = (flat ? 6 : 14) * (ell ? 1.5 : 1);
  const padY = (flat ? 5 : 9) * (ell ? 1.35 : 1);
  const lines = wrapCached(font, n.text, 210);
  const lineH = Math.round(size * (rtl ? 1.7 : 1.4));
  let tw = 0;
  for (const l of lines) tw = Math.max(tw, textWidth(font, l));
  let imgW = 0,
    imgH = 0;
  if (n.image) {
    imgW = IMG_W[n.image.size] ?? 150;
    imgH = imgW / (n.image.ar || 1);
    if (imgH > 230) {
      imgH = 230;
      imgW = imgH * n.image.ar;
    }
  }
  const dl = layoutDeco(n, (f, t) => textWidth(f, t));
  const inner = Math.max(tw, imgW, dl.rowW);
  const minW = depth === 0 ? 96 : flat ? 30 : 56;
  const w = Math.max(minW, Math.ceil(inner) + padX * 2);
  const h = lines.length * lineH + (imgH ? imgH + 6 : 0) + dl.topH + dl.bottomH + padY * 2;
  const textTop = padY + dl.topH + (imgH ? imgH + 6 : 0);
  const deco = dl.topH || dl.bottomH ? dl.build(w, padY, textTop + lines.length * lineH) : undefined;
  return {
    id,
    w,
    h,
    lines,
    font,
    fontSize: size,
    lineH,
    textTop,
    deco,
    img: n.image ? { x: (w - imgW) / 2, y: padY + dl.topH, w: imgW, h: imgH, fileId: n.image.fileId } : undefined,
    depth,
    rtl,
    shape,
  };
}

// ---------------------------------------------------------------- tata letak
export function computeLayout(sheet: Sheet): LayoutResult {
  const r = computeLayoutBase(sheet);
  if (sheet.table || sheet.venn) return r;
  let b = r.bounds;
  for (const q of boundaryRects(sheet, r)) {
    const x0 = Math.min(b.x, q.x - 2),
      y0 = Math.min(b.y, q.y - 2),
      x1 = Math.max(b.x + b.w, q.x + q.w + 2),
      y1 = Math.max(b.y + b.h, q.y + q.h + 2);
    b = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  return { ...r, bounds: b };
}

function computeLayoutBase(sheet: Sheet): LayoutResult {
  if (sheet.venn) {
    const g = vennGeom(sheet);
    return { nodes: {}, order: [], edges: [], bounds: { x: -10, y: -6, w: g.w + 20, h: g.h + 12 } };
  }
  if (sheet.table) {
    const g = tableGeom(sheet);
    return { nodes: {}, order: [], edges: [], bounds: { x: -2, y: -2, w: g.w + 4, h: g.h + 4 } };
  }
  const N = sheet.nodes;
  const rootId = sheet.rootId;
  const out: Record<string, LNode> = {};
  if (!N[rootId]) return { nodes: out, order: [], edges: [], bounds: { x: 0, y: 0, w: 1, h: 1 } };

  const kids = (id: string): string[] => {
    const n = N[id];
    return !n || n.collapsed ? [] : n.children.filter((c) => N[c]);
  };
  const walk = (id: string, depth: number, parent: string | null) => {
    const m = measure(sheet, id, depth);
    out[id] = {
      ...m,
      x: 0,
      y: 0,
      side: "c",
      parentId: parent,
      hasKids: N[id].children.some((c) => N[c]),
      hasHidden: !!N[id].collapsed && N[id].children.some((c) => N[c]),
    };
    kids(id).forEach((c) => walk(c, depth + 1, id));
  };
  walk(rootId, 0, null);

  const ctx: Ctx = { sheet, out, kids, rootId, edges: [], style: lineStyleFor(sheet) };
  switch (sheet.structure) {
    case "mind-right":
      horizontal(ctx, "right", false);
      break;
    case "mind-left":
      horizontal(ctx, "left", false);
      break;
    case "logic-right":
      horizontal(ctx, "right", false);
      break;
    case "logic-left":
      horizontal(ctx, "left", false);
      break;
    case "logic-both":
      horizontal(ctx, "both", false);
      break;
    case "brace-right":
      horizontal(ctx, "right", true);
      break;
    case "brace-left":
      horizontal(ctx, "left", true);
      break;
    case "org-down":
      vertical(ctx, false);
      break;
    case "org-up":
      vertical(ctx, true);
      break;
    case "tree-right":
      treeLayout(ctx, "r");
      break;
    case "tree-left":
      treeLayout(ctx, "l");
      break;
    case "timeline":
      timeline(ctx);
      break;
    case "fishbone":
      fishbone(ctx);
      break;
    default:
      horizontal(ctx, "both", false);
  }
  return finish(ctx);
}

function finish(ctx: Ctx): LayoutResult {
  const { out, rootId, sheet } = ctx;
  const both = sheet.structure === "mind-both" || sheet.structure === "logic-both" || !sheet.structure;
  for (const id in out) {
    const n = out[id];
    if (!n.hasKids || n.badge) continue;
    if (id === rootId) {
      const s = sheet.structure;
      if (both) continue;
      if (s.endsWith("-left")) n.badge = { x: n.x - 13, y: anchorY(n) };
      else if (s === "org-down") n.badge = { x: n.x + n.w / 2, y: n.y + n.h + 13 };
      else if (s === "org-up") n.badge = { x: n.x + n.w / 2, y: n.y - 13 };
      else n.badge = { x: n.x + n.w + 13, y: anchorY(n) };
      continue;
    }
    if (n.side === "r") n.badge = { x: n.x + n.w + 13, y: anchorY(n) };
    else if (n.side === "l") n.badge = { x: n.x - 13, y: anchorY(n) };
    else if (n.side === "d") n.badge = { x: n.x + n.w / 2, y: n.y + n.h + 13 };
    else if (n.side === "u") n.badge = { x: n.x + n.w / 2, y: n.y - 13 };
  }
  addSummaries(ctx);
  const order: string[] = [];
  const q = [rootId];
  while (q.length) {
    const id = q.shift()!;
    order.push(id);
    ctx.kids(id).forEach((c) => q.push(c));
  }
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const id in out) {
    const n = out[id];
    x0 = Math.min(x0, n.x - (n.badge && n.side === "l" ? 24 : 0));
    y0 = Math.min(y0, n.y);
    x1 = Math.max(x1, n.x + n.w + (n.badge && n.side === "r" ? 24 : 0));
    y1 = Math.max(y1, n.y + n.h);
  }
  for (const sid in out) if (sheet.nodes[sid]?.summary) order.push(sid);
  if (!isFinite(x0)) return { nodes: out, order, edges: ctx.edges, bounds: { x: 0, y: 0, w: 1, h: 1 } };
  return { nodes: out, order, edges: ctx.edges, bounds: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
}

// ---------------------------------------------------------------- ringkasan (summary)
const swapXY = (d: string) => d.replace(/(-?[\d.]+),(-?[\d.]+)/g, "$2,$1");

function addSummaries(ctx: Ctx) {
  const { out, sheet } = ctx;
  const N = sheet.nodes;
  const descend = (id: string, acc: string[]) => {
    acc.push(id);
    ctx.kids(id).forEach((c) => descend(c, acc));
  };
  for (const sid in N) {
    const s = N[sid].summary;
    if (!s) continue;
    const a = N[s.from],
      b = N[s.to];
    if (!a || !b || !a.parentId || a.parentId !== b.parentId || !out[a.parentId]) continue;
    const p = N[a.parentId];
    const i = p.children.indexOf(s.from),
      j = p.children.indexOf(s.to);
    if (i < 0 || j < 0) continue;
    const first = out[p.children[Math.min(i, j)]];
    if (!first) continue;
    const side = first.side;
    const ids: string[] = [];
    for (let k = Math.min(i, j); k <= Math.max(i, j); k++) {
      const c = p.children[k];
      if (out[c] && out[c].side === side) descend(c, ids);
    }
    if (!ids.length) continue;
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const id of ids) {
      const n = out[id];
      x0 = Math.min(x0, n.x - (n.badge && n.side === "l" ? 26 : 0));
      x1 = Math.max(x1, n.x + n.w + (n.badge && n.side === "r" ? 26 : 0));
      y0 = Math.min(y0, n.y - (n.badge && n.side === "u" ? 26 : 0));
      y1 = Math.max(y1, n.y + n.h + (n.badge && n.side === "d" ? 26 : 0));
    }
    const m = measure(sheet, sid, first.depth);
    const g = 10,
      L = 16,
      gap = 8;
    let d: string, bx: number, by: number;
    if (side === "l") {
      const st = x0 - g;
      d = bracePath(st - L, y0, y1, (y0 + y1) / 2, 1);
      bx = st - L - gap - m.w;
      by = (y0 + y1) / 2 - m.h / 2;
    } else if (side === "d") {
      const st = y1 + g;
      d = swapXY(bracePath(st + L, x0, x1, (x0 + x1) / 2, -1));
      bx = (x0 + x1) / 2 - m.w / 2;
      by = st + L + gap;
    } else if (side === "u") {
      const st = y0 - g;
      d = swapXY(bracePath(st - L, x0, x1, (x0 + x1) / 2, 1));
      bx = (x0 + x1) / 2 - m.w / 2;
      by = st - L - gap - m.h;
    } else {
      const st = x1 + g;
      d = bracePath(st + L, y0, y1, (y0 + y1) / 2, -1);
      bx = st + L + gap;
      by = (y0 + y1) / 2 - m.h / 2;
    }
    out[sid] = { ...m, x: bx, y: by, side, parentId: null, hasKids: false, hasHidden: false };
    ctx.edges.push({ key: "sum-" + sid, childId: sid, d, kind: "line" });
  }
}

// ---------------------------------------------------------------- horizontal (mind map, logic chart, brace map)
function horizontal(ctx: Ctx, mode: "right" | "left" | "both", brace: boolean) {
  const { out, kids, rootId } = ctx;
  const gapX = brace ? 74 : 58;
  const crossGap = 14;
  const memo = new Map<string, number>();
  const ext = (id: string): number => {
    const hit = memo.get(id);
    if (hit !== undefined) return hit;
    const ch = kids(id);
    let r = out[id].h;
    if (ch.length) r = Math.max(r, ch.reduce((a, c) => a + ext(c), 0) + crossGap * (ch.length - 1));
    memo.set(id, r);
    return r;
  };
  const placeKids = (id: string, dir: "r" | "l", center: number, only?: string[]) => {
    const p = out[id];
    const ch = only ?? kids(id);
    if (!ch.length) return;
    const total = ch.reduce((a, c) => a + ext(c), 0) + crossGap * (ch.length - 1);
    let cur = center - total / 2;
    for (const c of ch) {
      const e = ext(c);
      const cn = out[c];
      cn.side = dir;
      cn.x = dir === "r" ? p.x + p.w + gapX : p.x - gapX - cn.w;
      cn.y = cur + e / 2 - cn.h / 2;
      placeKids(c, dir, cur + e / 2);
      cur += e + crossGap;
    }
  };
  const r = out[rootId];
  r.x = -r.w / 2;
  r.y = -r.h / 2;
  const top = kids(rootId);
  if (mode === "right") placeKids(rootId, "r", 0);
  else if (mode === "left") placeKids(rootId, "l", 0);
  else {
    const total = top.reduce((a, c) => a + ext(c), 0);
    let acc = 0;
    const right: string[] = [],
      left: string[] = [];
    for (const c of top) {
      const e = ext(c);
      if (acc + e / 2 <= total / 2 || right.length === 0) right.push(c);
      else left.push(c);
      acc += e;
    }
    placeKids(rootId, "r", 0, right);
    placeKids(rootId, "l", 0, left);
  }

  // garis penghubung
  const groups = new Map<string, string[]>();
  for (const id in out) {
    const c = out[id];
    if (!c.parentId) continue;
    const p = out[c.parentId];
    const horizSide = c.side === "r" ? 1 : -1;
    if (brace) {
      const k = `${p.id}|${horizSide}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(id);
      continue;
    }
    const x1 = horizSide === 1 ? p.x + p.w : p.x;
    const x2 = horizSide === 1 ? c.x : c.x + c.w;
    ctx.edges.push({ key: "e:" + id, childId: id, kind: "line", d: link(ctx.style, x1, anchorY(p), x2, anchorY(c), true) });
  }
  if (brace) {
    for (const [k, list] of groups) {
      const [pid, s] = k.split("|");
      const dir = (Number(s) === 1 ? 1 : -1) as 1 | -1;
      const p = out[pid];
      const ym = p.y + p.h / 2;
      const y1 = Math.min(...list.map((i) => out[i].y));
      const y2 = Math.max(...list.map((i) => out[i].y + out[i].h));
      const x0 = dir === 1 ? p.x + p.w + 12 : p.x - 12;
      const pe = dir === 1 ? p.x + p.w : p.x;
      ctx.edges.push({
        key: "b:" + k,
        childId: pid,
        kind: "brace",
        d: `M${pe},${ym} L${x0},${ym} ` + bracePath(x0, y1, y2, ym, dir),
      });
    }
  }
}

// ---------------------------------------------------------------- bagan organisasi
function vertical(ctx: Ctx, up: boolean) {
  const { out, kids, rootId } = ctx;
  const gapY = 50,
    crossGap = 24;
  const memo = new Map<string, number>();
  const ext = (id: string): number => {
    const hit = memo.get(id);
    if (hit !== undefined) return hit;
    const ch = kids(id);
    let r = out[id].w;
    if (ch.length) r = Math.max(r, ch.reduce((a, c) => a + ext(c), 0) + crossGap * (ch.length - 1));
    memo.set(id, r);
    return r;
  };
  const placeKids = (id: string, center: number) => {
    const p = out[id];
    const ch = kids(id);
    if (!ch.length) return;
    const total = ch.reduce((a, c) => a + ext(c), 0) + crossGap * (ch.length - 1);
    let cur = center - total / 2;
    for (const c of ch) {
      const e = ext(c);
      const cn = out[c];
      cn.side = up ? "u" : "d";
      cn.x = cur + e / 2 - cn.w / 2;
      cn.y = up ? p.y - gapY - cn.h : p.y + p.h + gapY;
      placeKids(c, cur + e / 2);
      cur += e + crossGap;
    }
  };
  const r = out[rootId];
  r.x = -r.w / 2;
  r.y = up ? -r.h : 0;
  placeKids(rootId, 0);
  for (const id in out) {
    const c = out[id];
    if (!c.parentId) continue;
    const p = out[c.parentId];
    const x1 = p.x + p.w / 2,
      x2 = c.x + c.w / 2;
    const y1 = up ? p.y : p.y + p.h,
      y2 = up ? c.y + c.h : c.y;
    ctx.edges.push({ key: "e:" + id, childId: id, kind: "line", d: link(ctx.style, x1, y1, x2, y2, false) });
  }
}

// ---------------------------------------------------------------- pohon bertingkat (dipakai juga oleh linimasa & tulang ikan)
const INDENT = 26;
const TREE_GAP = 8;

function makeTree(ctx: Ctx) {
  const { out, kids } = ctx;
  const memo = new Map<string, number>();
  const height = (id: string): number => {
    const hit = memo.get(id);
    if (hit !== undefined) return hit;
    const ch = kids(id);
    let r = out[id].h;
    if (ch.length) r += 8 + ch.reduce((a, c) => a + height(c), 0) + TREE_GAP * (ch.length - 1);
    memo.set(id, r);
    return r;
  };
  /** ax = tepi kiri (arah r) atau tepi kanan (arah l). Mengembalikan tinggi blok. */
  const place = (id: string, ax: number, y: number, dir: "r" | "l"): void => {
    const n = out[id];
    n.side = dir;
    n.x = dir === "r" ? ax : ax - n.w;
    n.y = y;
    let cy = y + n.h + 8;
    for (const c of kids(id)) {
      place(c, dir === "r" ? ax + INDENT : ax - INDENT, cy, dir);
      cy += height(c) + TREE_GAP;
    }
    if (n.hasKids && !n.hasHidden) n.badge = { x: dir === "r" ? n.x + 14 : n.x + n.w - 14, y: n.y + n.h + 10 };
    else if (n.hasHidden) n.badge = { x: dir === "r" ? n.x + 14 : n.x + n.w - 14, y: n.y + n.h + 10 };
  };
  const edges = (id: string, dir: "r" | "l") => {
    const p = out[id];
    const sx = dir === "r" ? p.x + 14 : p.x + p.w - 14;
    for (const c of kids(id)) {
      const cn = out[c];
      const x2 = dir === "r" ? cn.x : cn.x + cn.w;
      const y2 = anchorY(cn);
      const y1 = p.y + p.h;
      const sg = dir === "r" ? 1 : -1;
      let d: string;
      if (ctx.style === "straight") d = `M${sx},${y1} L${x2},${y2}`;
      else if (ctx.style === "curve") d = `M${sx},${y1} Q${sx},${y2} ${x2},${y2}`;
      else if (ctx.style === "round") {
        const r = Math.min(10, Math.abs(x2 - sx), Math.max(0, y2 - y1));
        d = `M${sx},${y1} L${sx},${y2 - r} Q${sx},${y2} ${sx + sg * r},${y2} L${x2},${y2}`;
      } else d = `M${sx},${y1} L${sx},${y2} L${x2},${y2}`;
      ctx.edges.push({ key: "e:" + c, childId: c, kind: "line", d });
      edges(c, dir);
    }
  };
  return { height, place, edges };
}

function treeLayout(ctx: Ctx, dir: "r" | "l") {
  const t = makeTree(ctx);
  const r = ctx.out[ctx.rootId];
  t.place(ctx.rootId, 0, 0, dir);
  r.side = "c";
  t.edges(ctx.rootId, dir);
}

// ---------------------------------------------------------------- linimasa
function timeline(ctx: Ctx) {
  const { out, kids, rootId } = ctx;
  const t = makeTree(ctx);
  const r = out[rootId];
  r.x = 0;
  r.y = -r.h / 2;
  const mains = kids(rootId);
  let prevMainRight = r.x + r.w + 24;
  const ext = { up: -Infinity, down: -Infinity };
  let axisEnd = r.x + r.w + 40;

  mains.forEach((mid, i) => {
    const m = out[mid];
    const above = i % 2 === 0;
    const side = above ? "up" : "down";
    const cx = Math.max(prevMainRight + 34 + m.w / 2, ext[side] + 10);
    m.x = cx - m.w / 2;
    m.y = -m.h / 2;
    m.side = above ? "u" : "d";
    const ch = kids(mid);
    const H = ch.reduce((a, c) => a + t.height(c), 0) + TREE_GAP * Math.max(0, ch.length - 1);
    let y = above ? m.y - 28 - H : m.y + m.h + 28;
    const startY = y;
    let right = cx + m.w / 2;
    for (const c of ch) {
      t.place(c, cx + 16, y, "r");
      y += t.height(c) + TREE_GAP;
    }
    for (const c of ch) {
      const sub: string[] = [c];
      while (sub.length) {
        const s = sub.pop()!;
        right = Math.max(right, out[s].x + out[s].w + (out[s].hasKids ? 8 : 0));
        kids(s).forEach((k) => sub.push(k));
      }
    }
    // garis dari topik utama ke anak-anaknya
    const y1 = above ? m.y : m.y + m.h;
    for (const c of ch) {
      const cn = out[c];
      ctx.edges.push({ key: "e:" + c, childId: c, kind: "line", d: `M${cx},${y1} L${cx},${anchorY(cn)} L${cn.x},${anchorY(cn)}` });
      t.edges(c, "r");
    }
    if (m.hasKids) m.badge = { x: cx, y: above ? m.y - 13 : m.y + m.h + 13 };
    void startY;
    prevMainRight = cx + m.w / 2;
    ext[side] = Math.max(ext[side], right);
    axisEnd = Math.max(axisEnd, cx + m.w / 2 + 40);
  });
  ctx.edges.unshift({ key: "axis", childId: rootId, kind: "axis", d: `M${r.x + r.w},0 L${axisEnd},0` });
}

// ---------------------------------------------------------------- tulang ikan
function fishbone(ctx: Ctx) {
  const { out, kids, rootId } = ctx;
  const t = makeTree(ctx);
  const r = out[rootId];
  r.x = 0;
  r.y = -r.h / 2;
  const mains = kids(rootId);

  interface Bone {
    id: string;
    above: boolean;
    L: number;
    s: number;
    ids: string[];
    rows: string[];
    minX: number;
    maxX: number;
  }
  const bones: Bone[] = [];
  // 1) susun tiap tulang relatif terhadap titik sambung di tulang punggung (xs = 0)
  mains.forEach((mid, i) => {
    const m = out[mid];
    const above = i % 2 === 0;
    const rows = kids(mid);
    const H = rows.reduce((a, c) => a + t.height(c), 0) + TREE_GAP * Math.max(0, rows.length - 1);
    const L = Math.max(70, H + 44);
    const s = L * 0.5;
    const boneX = (y: number) => -s * (Math.abs(y) / L);
    m.side = above ? "u" : "d";
    m.x = -s - m.w / 2;
    m.y = above ? -L - m.h : L;
    let y = above ? -L + 22 : 22;
    const ids: string[] = [mid];
    for (const c of rows) {
      t.place(c, boneX(y + out[c].h / 2) - 14, y, "l");
      y += t.height(c) + TREE_GAP;
    }
    let minX = m.x,
      maxX = m.x + m.w;
    for (const c of rows) {
      const stack = [c];
      while (stack.length) {
        const s2 = stack.pop()!;
        ids.push(s2);
        minX = Math.min(minX, out[s2].x);
        maxX = Math.max(maxX, out[s2].x + out[s2].w);
        kids(s2).forEach((k) => stack.push(k));
      }
    }
    bones.push({ id: mid, above, L, s, ids, rows, minX, maxX: Math.max(maxX, 0) });
  });

  // 2) letakkan pasangan tulang dari kepala ke ekor
  let xs = 0;
  let prevLeft = r.x - 46;
  let tail = r.x - 40;
  for (let i = 0; i < bones.length; i += 2) {
    const pair = bones.slice(i, i + 2);
    const maxX = Math.max(...pair.map((b) => b.maxX));
    const minX = Math.min(...pair.map((b) => b.minX));
    xs = prevLeft - 20 - maxX;
    for (const b of pair) {
      for (const id of b.ids) out[id].x += xs;
      for (const id of b.ids) if (out[id].badge) out[id].badge = { x: out[id].badge!.x + xs, y: out[id].badge!.y };
      const boneX = (y: number) => xs - b.s * (Math.abs(y) / b.L);
      const m = out[b.id];
      const bx = xs - b.s;
      ctx.edges.push({
        key: "e:" + b.id,
        childId: b.id,
        kind: "line",
        d: `M${bx},${b.above ? m.y + m.h : m.y} L${xs},0`,
      });
      for (const c of b.rows) {
        const cn = out[c];
        const y = anchorY(cn);
        ctx.edges.push({ key: "e:" + c, childId: c, kind: "line", d: `M${cn.x + cn.w},${y} L${boneX(y)},${y}` });
        t.edges(c, "l");
      }
      if (m.hasKids) m.badge = { x: bx, y: b.above ? m.y - 13 : m.y + m.h + 13 };
    }
    prevLeft = xs + minX;
    tail = Math.min(tail, xs + minX - 20);
  }
  ctx.edges.unshift({ key: "axis", childId: rootId, kind: "axis", d: `M${tail},0 L${r.x},0` });
}
