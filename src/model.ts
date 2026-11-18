import { LayoutKind, MapDoc, MNode, defaultPitch } from "./types";

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export type Nodes = Record<string, MNode>;

export function newDoc(title = "Peta baru"): MapDoc {
  const rootId = uid();
  const now = Date.now();
  const nodes: Nodes = {
    [rootId]: { id: rootId, parentId: null, text: title, children: [], shape: "pill" },
  };
  return {
    id: uid(),
    title,
    rootId,
    nodes,
    layout: "map",
    pitch: defaultPitch(),
    createdAt: now,
    updatedAt: now,
  };
}

export function sampleDoc(): MapDoc {
  const d = newDoc("Rencana Peluncuran Produk");
  const add = (parent: string, text: string) => {
    const r = addChild(d.nodes, parent, text);
    d.nodes = r.nodes;
    return r.id;
  };
  const root = d.rootId;
  const riset = add(root, "Riset pasar");
  add(riset, "Survei pengguna");
  add(riset, "Analisis pesaing");
  add(riset, "Segmentasi target");
  const prod = add(root, "Produk");
  add(prod, "Fitur inti");
  add(prod, "Desain antarmuka");
  add(prod, "Uji coba beta");
  const mark = add(root, "Pemasaran");
  add(mark, "Media sosial");
  add(mark, "Kemitraan");
  add(mark, "Acara peluncuran");
  const ops = add(root, "Operasional");
  add(ops, "Tim dukungan");
  add(ops, "Logistik");
  d.nodes[root].note = "Ringkasan rencana peluncuran kuartal berikutnya";
  return d;
}

export function addChild(
  nodes: Nodes,
  parentId: string,
  text = "Topik baru",
  index?: number
): { nodes: Nodes; id: string } {
  const id = uid();
  const parent = nodes[parentId];
  const children = parent.children.slice();
  if (index === undefined || index > children.length) children.push(id);
  else children.splice(index, 0, id);
  return {
    id,
    nodes: {
      ...nodes,
      [parentId]: { ...parent, children, collapsed: false },
      [id]: { id, parentId, text, children: [] },
    },
  };
}

export function addSibling(
  nodes: Nodes,
  id: string,
  text = "Topik baru"
): { nodes: Nodes; id: string } | null {
  const n = nodes[id];
  if (!n || !n.parentId) return null;
  const p = nodes[n.parentId];
  return addChild(nodes, p.id, text, p.children.indexOf(id) + 1);
}

export function collectSubtree(nodes: Nodes, id: string): string[] {
  const out: string[] = [];
  const walk = (i: string) => {
    out.push(i);
    nodes[i].children.forEach(walk);
  };
  walk(id);
  return out;
}

export function removeNode(nodes: Nodes, id: string): Nodes {
  const n = nodes[id];
  if (!n || !n.parentId) return nodes;
  const gone = new Set(collectSubtree(nodes, id));
  const next: Nodes = {};
  for (const k in nodes) if (!gone.has(k)) next[k] = nodes[k];
  const p = next[n.parentId];
  next[p.id] = { ...p, children: p.children.filter((c) => c !== id) };
  return next;
}

export function isDescendant(nodes: Nodes, ancestor: string, id: string): boolean {
  let cur: string | null = id;
  while (cur) {
    if (cur === ancestor) return true;
    cur = nodes[cur]?.parentId ?? null;
  }
  return false;
}

export function moveNode(
  nodes: Nodes,
  id: string,
  newParentId: string,
  index?: number
): Nodes {
  const n = nodes[id];
  if (!n || !n.parentId || id === newParentId) return nodes;
  if (isDescendant(nodes, id, newParentId)) return nodes;
  const next = { ...nodes };
  const oldP = next[n.parentId];
  const oldChildren = oldP.children.filter((c) => c !== id);
  next[oldP.id] = { ...oldP, children: oldChildren };
  const np = next[newParentId];
  const kids = np.children.filter((c) => c !== id);
  if (index === undefined || index > kids.length) kids.push(id);
  else kids.splice(index, 0, id);
  next[newParentId] = { ...np, children: kids, collapsed: false };
  next[id] = { ...n, parentId: newParentId };
  return next;
}

/** Geser urutan di antara saudara (dir -1 naik, +1 turun). */
export function reorder(nodes: Nodes, id: string, dir: -1 | 1): Nodes {
  const n = nodes[id];
  if (!n?.parentId) return nodes;
  const p = nodes[n.parentId];
  const i = p.children.indexOf(id);
  const j = i + dir;
  if (j < 0 || j >= p.children.length) return nodes;
  const children = p.children.slice();
  [children[i], children[j]] = [children[j], children[i]];
  return { ...nodes, [p.id]: { ...p, children } };
}

/** Tab-in: jadikan anak dari saudara sebelumnya. */
export function indent(nodes: Nodes, id: string): Nodes {
  const n = nodes[id];
  if (!n?.parentId) return nodes;
  const p = nodes[n.parentId];
  const i = p.children.indexOf(id);
  if (i <= 0) return nodes;
  return moveNode(nodes, id, p.children[i - 1]);
}

/** Shift+Tab: naik satu level, ditempatkan setelah induk lama. */
export function outdent(nodes: Nodes, id: string): Nodes {
  const n = nodes[id];
  if (!n?.parentId) return nodes;
  const p = nodes[n.parentId];
  if (!p.parentId) return nodes;
  const gp = nodes[p.parentId];
  return moveNode(nodes, id, gp.id, gp.children.indexOf(p.id) + 1);
}

export function updateNode(nodes: Nodes, id: string, patch: Partial<MNode>): Nodes {
  if (!nodes[id]) return nodes;
  return { ...nodes, [id]: { ...nodes[id], ...patch } };
}

export function depthOf(nodes: Nodes, id: string): number {
  let d = 0;
  let cur = nodes[id]?.parentId;
  while (cur) {
    d++;
    cur = nodes[cur]?.parentId;
  }
  return d;
}

/** Cabang utama di level 1 (anak langsung root). */
export function branchColor(nodes: Nodes, rootId: string, id: string, palette: string[]): string {
  let cur = nodes[id];
  if (!cur) return palette[0];
  while (cur.parentId && cur.parentId !== rootId) cur = nodes[cur.parentId];
  const idx = nodes[rootId].children.indexOf(cur.id);
  return palette[(idx < 0 ? 0 : idx) % palette.length];
}

export const BRANCH_PALETTE = [
  "#6366f1",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#0ea5e9",
  "#8b5cf6",
  "#ef4444",
  "#14b8a6",
];

/** Urutan tampil (DFS) dengan memperhatikan collapse. */
export function visibleOrder(nodes: Nodes, rootId: string): string[] {
  const out: string[] = [];
  const walk = (id: string) => {
    out.push(id);
    const n = nodes[id];
    if (!n.collapsed) n.children.forEach(walk);
  };
  walk(rootId);
  return out;
}

export function layoutLabel(l: LayoutKind): string {
  return l === "map" ? "Peta dua sisi" : l === "right" ? "Bagan logika" : "Bagan organisasi";
}
