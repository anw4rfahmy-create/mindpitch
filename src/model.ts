import { normalizeTable, templateTable, TableTemplate } from "./table";
import { MNode, Sheet, StructureId, Workbook, defaultBg, defaultPitch } from "./types";

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export type Nodes = Record<string, MNode>;

// ---------------------------------------------------------------- lembar & berkas
export function newSheet(title = "Lembar 1", rootText = "Topik utama", structure: StructureId = "mind-both"): Sheet {
  const rootId = uid();
  return {
    id: uid(),
    title,
    rootId,
    nodes: { [rootId]: { id: rootId, parentId: null, text: rootText, children: [] } },
    structure,
    theme: "pelangi",
    colored: true,
    lineStyle: "auto",
    lineWidth: 0,
    topicStyle: "auto",
    font: "system",
    bg: defaultBg(),
    floats: [],
    pitch: defaultPitch(),
  };
}

export function newTableSheet(title: string, tpl: TableTemplate): Sheet {
  const s = newSheet(title, title);
  s.table = templateTable(tpl);
  return s;
}

export function newWorkbook(title = "Berkas baru"): Workbook {
  const s = newSheet("Lembar 1", title);
  const now = Date.now();
  return { id: uid(), title, sheets: [s], activeId: s.id, createdAt: now, updatedAt: now };
}

function build(sheet: Sheet, tree: [string, ...any[]], parent?: string): void {
  const [text, ...kids] = tree;
  let id = parent ? "" : sheet.rootId;
  if (parent) {
    const r = addChild(sheet.nodes, parent, text);
    sheet.nodes = r.nodes;
    id = r.id;
  } else sheet.nodes[id] = { ...sheet.nodes[id], text };
  for (const k of kids) build(sheet, k, id);
}

export function sampleWorkbook(): Workbook {
  const a = newSheet("Peluncuran Produk", "Rencana Peluncuran Produk");
  build(a, [
    "Rencana Peluncuran Produk",
    ["Riset pasar", ["Survei pengguna"], ["Analisis pesaing"], ["Segmentasi target"]],
    ["Produk", ["Fitur inti"], ["Desain antarmuka"], ["Uji coba beta"]],
    ["Pemasaran", ["Media sosial", ["Instagram"], ["TikTok"], ["YouTube"]], ["Kemitraan"], ["Acara peluncuran"]],
    ["Operasional", ["Tim dukungan"], ["Logistik"]],
  ]);
  a.nodes[a.rootId].note = "Ringkasan rencana peluncuran kuartal berikutnya.";

  const b = newSheet("أركان الإسلام", "أركان الإسلام");
  b.font = "amiri";
  build(b, [
    "أركان الإسلام",
    ["الشهادتان", ["Syahadat: pengakuan keesaan Allah"]],
    ["الصلاة", ["Lima waktu sehari semalam"]],
    ["الزكاة", ["Memberi harta yang wajib"], ["Kepada yang berhak"]],
    ["الصوم", ["Puasa bulan Ramadan"]],
    ["الحج", ["Ziarah ke Baitullah"], ["Bagi yang mampu"]],
  ]);

  const c = newSheet("Linimasa", "Jadwal Proyek", "timeline");
  build(c, [
    "Jadwal Proyek",
    ["Januari", ["Perencanaan"], ["Rekrut tim"]],
    ["Maret", ["Desain"], ["Prototipe"]],
    ["Mei", ["Pengembangan"], ["Pengujian"]],
    ["Juli", ["Peluncuran"]],
  ]);

  const now = Date.now();
  return { id: uid(), title: "Contoh Map It by Anwar", sheets: [a, b, c], activeId: a.id, createdAt: now, updatedAt: now };
}

export const activeSheet = (wb: Workbook): Sheet => wb.sheets.find((s) => s.id === wb.activeId) ?? wb.sheets[0];

export function replaceSheet(wb: Workbook, id: string, fn: (s: Sheet) => Sheet): Workbook {
  let changed = false;
  const sheets = wb.sheets.map((s) => {
    if (s.id !== id) return s;
    const n = fn(s);
    if (n !== s) changed = true;
    return n;
  });
  return changed ? { ...wb, sheets } : wb;
}

// ---------------------------------------------------------------- operasi pohon
export function addChild(nodes: Nodes, parentId: string, text = "Topik baru", index?: number): { nodes: Nodes; id: string } {
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

export function addSibling(nodes: Nodes, id: string, text = "Topik baru"): { nodes: Nodes; id: string } | null {
  const n = nodes[id];
  if (!n || !n.parentId) return null;
  const p = nodes[n.parentId];
  return addChild(nodes, p.id, text, p.children.indexOf(id) + 1);
}

export function collectSubtree(nodes: Nodes, id: string): string[] {
  const out: string[] = [];
  const walk = (i: string) => {
    if (!nodes[i]) return;
    out.push(i);
    nodes[i].children.forEach(walk);
  };
  walk(id);
  return out;
}

/** Buat Ringkasan untuk topik-topik bersaudara (satu induk). */
export function addSummary(nodes: Nodes, ids: string[]): { nodes: Nodes; id: string } | null {
  const list = ids.map((i) => nodes[i]).filter((n) => n && n.parentId && !n.summary);
  if (!list.length) return null;
  const pid = list[0].parentId!;
  if (list.some((n) => n.parentId !== pid)) return null;
  const order = nodes[pid].children;
  const idx = list.map((n) => order.indexOf(n.id)).filter((i) => i >= 0).sort((a, b) => a - b);
  if (!idx.length) return null;
  const id = uid();
  return { id, nodes: { ...nodes, [id]: { id, parentId: null, text: "Ringkasan", children: [], summary: { from: order[idx[0]], to: order[idx[idx.length - 1]] } } } };
}

export function removeNode(nodes: Nodes, id: string): Nodes {
  const n = nodes[id];
  if (n?.summary) {
    const rest = { ...nodes };
    delete rest[id];
    return rest;
  }
  if (!n || !n.parentId) return nodes;
  const gone = new Set(collectSubtree(nodes, id));
  const next: Nodes = {};
  for (const k in nodes) if (!gone.has(k)) next[k] = nodes[k];
  for (const k in next) {
    const sm = next[k].summary;
    if (sm && (gone.has(sm.from) || gone.has(sm.to))) delete next[k];
  }
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

export function moveNode(nodes: Nodes, id: string, newParentId: string, index?: number): Nodes {
  const n = nodes[id];
  if (!n || !n.parentId || id === newParentId) return nodes;
  if (isDescendant(nodes, id, newParentId)) return nodes;
  const next = { ...nodes };
  const oldP = next[n.parentId];
  next[oldP.id] = { ...oldP, children: oldP.children.filter((c) => c !== id) };
  const np = next[newParentId];
  const kids = np.children.filter((c) => c !== id);
  if (index === undefined || index > kids.length) kids.push(id);
  else kids.splice(index, 0, id);
  next[newParentId] = { ...np, children: kids, collapsed: false };
  next[id] = { ...n, parentId: newParentId };
  return next;
}

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

export function indent(nodes: Nodes, id: string): Nodes {
  const n = nodes[id];
  if (!n?.parentId) return nodes;
  const p = nodes[n.parentId];
  const i = p.children.indexOf(id);
  if (i <= 0) return nodes;
  return moveNode(nodes, id, p.children[i - 1]);
}

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

/** Urutan cabang utama tempat topik ini berada (0 untuk topik pusat). */
export function branchIndex(nodes: Nodes, rootId: string, id: string): number {
  let cur = nodes[id];
  if (!cur || id === rootId) return 0;
  while (cur.parentId && cur.parentId !== rootId) cur = nodes[cur.parentId];
  const i = nodes[rootId].children.indexOf(cur.id);
  return i < 0 ? 0 : i;
}

/** Lipat/buka seluruh peta: tampilkan `level` tingkat di bawah topik pusat (Infinity = semua). */
export function foldToLevel(nodes: Nodes, rootId: string, level: number): Nodes {
  const next: Nodes = { ...nodes };
  const walk = (id: string, d: number) => {
    const n = next[id];
    if (!n) return;
    const want = n.children.length > 0 && d >= level;
    if (!!n.collapsed !== want) next[id] = { ...n, collapsed: want || undefined };
    n.children.forEach((c) => walk(c, d + 1));
  };
  walk(rootId, 0);
  return next;
}

export function maxDepth(nodes: Nodes, rootId: string): number {
  let m = 0;
  const walk = (id: string, d: number) => {
    m = Math.max(m, d);
    nodes[id]?.children.forEach((c) => walk(c, d + 1));
  };
  walk(rootId, 0);
  return m;
}

/** Semua id berkas yang dipakai oleh berkas kerja (untuk membersihkan berkas yatim). */
export function usedFileIds(wb: Workbook): Set<string> {
  const used = new Set<string>();
  for (const s of wb.sheets) {
    if (s.bg.imageId) used.add(s.bg.imageId);
    if (s.pitch.bgImageId) used.add(s.pitch.bgImageId);
    s.floats.forEach((f) => used.add(f.fileId));
    for (const id in s.nodes) {
      const n = s.nodes[id];
      if (n.image) used.add(n.image.fileId);
      n.attachments?.forEach((a) => used.add(a.id));
      if (n.audio) used.add(n.audio.id);
    }
  }
  return used;
}

// ---------------------------------------------------------------- normalisasi (migrasi & impor)
const STRUCT_MAP: Record<string, StructureId> = { map: "mind-both", right: "logic-right", down: "org-down" };

function normalizeSheet(raw: any): Sheet | null {
  if (!raw || typeof raw !== "object" || !raw.nodes || !raw.rootId || !raw.nodes[raw.rootId]) return null;
  const base = newSheet(String(raw.title || "Lembar"), "x");
  const nodes: Nodes = {};
  for (const id in raw.nodes) {
    const n = raw.nodes[id];
    if (!n) continue;
    nodes[id] = { ...n, id, children: Array.isArray(n.children) ? n.children.filter((c: string) => raw.nodes[c]) : [] };
  }
  const structure: StructureId = raw.structure ?? STRUCT_MAP[raw.layout] ?? "mind-both";
  const pitch = { ...defaultPitch(), ...(raw.pitch && raw.pitch.secondsPerStep !== undefined ? raw.pitch : {}) };
  return {
    ...base,
    ...raw,
    id: String(raw.id || uid()),
    title: String(raw.title || nodes[raw.rootId].text || "Lembar"),
    nodes,
    structure,
    table: raw.table ? normalizeTable(raw.table) : undefined,
    bg: { ...defaultBg(), ...(raw.bg || {}) },
    floats: Array.isArray(raw.floats) ? raw.floats : [],
    pitch,
  };
}

/** Terima berkas kerja baru, berkas lama (satu peta), atau JSON impor; kembalikan Workbook valid atau null. */
export function normalizeWorkbook(raw: any): Workbook | null {
  if (!raw || typeof raw !== "object") return null;
  const now = Date.now();
  if (Array.isArray(raw.sheets)) {
    const sheets = raw.sheets.map(normalizeSheet).filter(Boolean) as Sheet[];
    if (!sheets.length) return null;
    return {
      id: String(raw.id || uid()),
      title: String(raw.title || sheets[0].title),
      sheets,
      activeId: sheets.some((s) => s.id === raw.activeId) ? raw.activeId : sheets[0].id,
      createdAt: raw.createdAt || now,
      updatedAt: raw.updatedAt || now,
    };
  }
  // format lama: satu peta per dokumen
  const s = normalizeSheet({ ...raw, title: raw.title });
  if (!s) return null;
  return { id: String(raw.id || uid()), title: s.title, sheets: [s], activeId: s.id, createdAt: raw.createdAt || now, updatedAt: raw.updatedAt || now };
}
