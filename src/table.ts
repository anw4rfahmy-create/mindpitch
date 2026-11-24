// Lembar tabel: geometri, penggambaran (kanvas & SVG), operasi baris/kolom, dan templat.
import { ensureFonts, familyCss, fontString, isRtl } from "./fonts";
import { textWidth, wrapCached } from "./measure";
import { contrastText } from "./nodeStyle";
import { CellStyle, Merge, Sheet, StripeMode, TableData } from "./types";

export const PAD_X = 12;
export const PAD_Y = 8;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const keyOf = (r: number, c: number) => `${r},${c}`;

export interface ResolvedCell {
  bg: string;
  color: string;
  bold: boolean;
  align: "l" | "c" | "r";
  size: number;
}

export const stripeModeOf = (t: TableData): StripeMode => t.stripeMode ?? (t.stripe ? "rows" : "none");

export function resolveCell(t: TableData, r: number, c: number): ResolvedCell {
  const st: CellStyle = t.style[keyOf(r, c)] ?? {};
  const head = r < t.headRows || c < t.headCols;
  const mode = stripeModeOf(t);
  const rb = (r - t.headRows) % 2 === 1,
    cb = (c - t.headCols) % 2 === 1;
  const stripe = !head && ((mode === "rows" && rb) || (mode === "cols" && cb) || (mode === "both" && rb !== cb));
  const bg = st.bg ?? (head ? t.headBg : stripe ? t.stripeBg ?? "#f1f5fb" : "#ffffff");
  const color = st.color ?? contrastText(bg);
  return { bg, color, bold: st.bold ?? head, align: st.align ?? "c", size: st.size ?? t.fontSize };
}

export const cellFontId = (t: TableData, text: string) => (isRtl(text) ? t.arFont : t.font);
export const cellLineH = (size: number, rtl: boolean) => Math.round(size * (rtl ? 1.8 : 1.45));

export interface TCell {
  r: number;
  c: number;
  rs: number;
  cs: number;
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
  font: string;
  fam: string;
  rtl: boolean;
  lineH: number;
  res: ResolvedCell;
}

export interface TGeom {
  w: number;
  h: number;
  cells: TCell[];
  colW: number[];
  rowH: number[];
}

/** Peta gabungan sel: anchor "r,c" → Merge, dan himpunan sel yang tertutup. */
export function mergeMaps(t: TableData) {
  const anchors = new Map<string, Merge>();
  const covered = new Set<string>();
  for (const m of t.merges ?? []) {
    if (m.r < 0 || m.c < 0 || m.r + m.rs > t.rows || m.c + m.cs > t.cols || (m.rs < 2 && m.cs < 2)) continue;
    anchors.set(keyOf(m.r, m.c), m);
    for (let r = m.r; r < m.r + m.rs; r++) for (let c = m.c; c < m.c + m.cs; c++) if (r !== m.r || c !== m.c) covered.add(keyOf(r, c));
  }
  return { anchors, covered };
}

/** Lebar kolom (px) yang dipakai: nilai tersimpan, atau otomatis menurut isi. */
export function columnWidths(sheet: Sheet): number[] {
  const t = sheet.table!;
  const { anchors, covered } = mergeMaps(t);
  const colW: number[] = [];
  for (let c = 0; c < t.cols; c++) {
    if (t.colW[c] > 0) {
      colW[c] = t.colW[c];
      continue;
    }
    let m = 0;
    for (let r = 0; r < t.rows; r++) {
      const k = keyOf(r, c);
      if (covered.has(k) || (anchors.get(k)?.cs ?? 1) > 1) continue;
      const txt = t.cells[r]?.[c] ?? "";
      const res = resolveCell(t, r, c);
      const font = fontString(cellFontId(t, txt), res.bold ? 700 : 400, res.size);
      for (const l of txt.split("\n")) m = Math.max(m, textWidth(font, l));
    }
    colW[c] = Math.min(320, Math.max(72, Math.ceil(m) + PAD_X * 2 + 4));
  }
  return colW;
}

export function tableGeom(sheet: Sheet): TGeom {
  const t = sheet.table!;
  const { anchors, covered } = mergeMaps(t);
  const colW = columnWidths(sheet);
  const rowH: number[] = Array(t.rows).fill(40);
  const raw: TCell[] = [];
  const pending: { r: number; rs: number; need: number }[] = [];
  for (let r = 0; r < t.rows; r++) {
    let h = 0;
    for (let c = 0; c < t.cols; c++) {
      const key = keyOf(r, c);
      if (covered.has(key)) continue;
      const mg = anchors.get(key);
      const rs = mg?.rs ?? 1,
        cs = mg?.cs ?? 1;
      let wsum = 0;
      for (let k = c; k < c + cs; k++) wsum += colW[k];
      const txt = t.cells[r]?.[c] ?? "";
      const res = resolveCell(t, r, c);
      const id = cellFontId(t, txt);
      const rtl = isRtl(txt);
      const font = fontString(id, res.bold ? 700 : 400, res.size);
      const lines = wrapCached(font, txt, wsum - PAD_X * 2);
      const lineH = cellLineH(res.size, rtl);
      const need = lines.length * lineH + PAD_Y * 2;
      if (rs === 1) h = Math.max(h, need);
      else pending.push({ r, rs, need });
      raw.push({ r, c, rs, cs, x: 0, y: 0, w: wsum, h: 0, lines, font, fam: familyCss(id), rtl, lineH, res });
    }
    rowH[r] = Math.max(h, 40);
  }
  for (const p of pending) {
    let sum = 0;
    for (let r = p.r; r < p.r + p.rs; r++) sum += rowH[r];
    if (p.need > sum) rowH[p.r + p.rs - 1] += p.need - sum;
  }
  const total = colW.reduce((a, b) => a + b, 0);
  const xs: number[] = [];
  let acc = 0;
  for (let v = 0; v < t.cols; v++) {
    const c = t.rtl ? t.cols - 1 - v : v;
    xs[c] = acc;
    acc += colW[c];
  }
  const ys: number[] = [];
  let ya = 0;
  for (let r = 0; r < t.rows; r++) {
    ys[r] = ya;
    ya += rowH[r];
  }
  for (const k of raw) {
    let x0 = Infinity;
    for (let c = k.c; c < k.c + k.cs; c++) x0 = Math.min(x0, xs[c]);
    k.x = x0;
    k.y = ys[k.r];
    let h = 0;
    for (let r = k.r; r < k.r + k.rs; r++) h += rowH[r];
    k.h = h;
  }
  return { w: total, h: ya, cells: raw, colW, rowH };
}

const textX = (k: TCell) => (k.res.align === "c" ? k.x + k.w / 2 : k.res.align === "l" ? k.x + PAD_X : k.x + k.w - PAD_X);

export async function ensureTableFonts(sheet: Sheet) {
  if (sheet.table) await ensureFonts([sheet.table.font, sheet.table.arFont]);
}

export function drawTable(ctx: CanvasRenderingContext2D, sheet: Sheet) {
  const t = sheet.table!;
  const g = tableGeom(sheet);
  for (const k of g.cells) {
    ctx.fillStyle = k.res.bg;
    ctx.fillRect(k.x, k.y, k.w, k.h);
  }
  ctx.strokeStyle = t.border;
  ctx.lineWidth = 1.2;
  ctx.lineJoin = "miter";
  for (const k of g.cells) ctx.strokeRect(k.x, k.y, k.w, k.h);
  ctx.lineWidth = 2.4;
  ctx.strokeRect(0, 0, g.w, g.h);
  ctx.textBaseline = "middle";
  for (const k of g.cells) {
    ctx.fillStyle = k.res.color;
    ctx.font = k.font;
    ctx.direction = k.rtl ? "rtl" : "ltr";
    ctx.textAlign = k.res.align === "c" ? "center" : k.res.align === "l" ? "left" : "right";
    const top = k.y + (k.h - k.lines.length * k.lineH) / 2;
    k.lines.forEach((l, i) => ctx.fillText(l, textX(k), top + k.lineH * (i + 0.5)));
  }
  ctx.direction = "ltr";
}

export function tableSvg(sheet: Sheet): string {
  const t = sheet.table!;
  const g = tableGeom(sheet);
  const P: string[] = [];
  for (const k of g.cells) P.push(`<rect x="${k.x}" y="${k.y}" width="${k.w}" height="${k.h}" fill="${k.res.bg}" stroke="${t.border}" stroke-width="1.2"/>`);
  P.push(`<rect width="${g.w}" height="${g.h}" fill="none" stroke="${t.border}" stroke-width="2.4"/>`);
  for (const k of g.cells) {
    const anchor = k.res.align === "c" ? "middle" : k.res.align === "l" ? "start" : "end";
    const top = k.y + (k.h - k.lines.length * k.lineH) / 2;
    k.lines.forEach((l, i) =>
      P.push(
        `<text x="${textX(k)}" y="${top + k.lineH * (i + 0.5)}" text-anchor="${anchor}" dominant-baseline="central" direction="${k.rtl ? "rtl" : "ltr"}" fill="${k.res.color}" font-family="${k.fam.replace(/"/g, "'")}" font-size="${k.res.size}" font-weight="${k.res.bold ? 700 : 400}">${esc(l)}</text>`
      )
    );
  }
  return P.join("");
}

// ---------------------------------------------------------------- operasi
export const cloneTable = (t: TableData): TableData => ({
  ...t,
  cells: t.cells.map((r) => r.slice()),
  style: { ...t.style },
  colW: t.colW.slice(),
  merges: t.merges?.map((m) => ({ ...m })),
});

export function blankTable(rows = 4, cols = 4): TableData {
  return {
    rows,
    cols,
    cells: Array.from({ length: rows }, () => Array(cols).fill("")),
    style: {},
    colW: Array(cols).fill(0),
    headRows: 1,
    headCols: 0,
    rtl: false,
    font: "system",
    arFont: "amiri",
    fontSize: 18,
    headBg: "#4f46e5",
    stripe: true,
    border: "#94a3b8",
  };
}

/** Normalisasi tabel dari berkas (jaga agar ukuran konsisten). */
export function normalizeTable(raw: any): TableData {
  const b = blankTable();
  const rows = Math.max(1, Math.min(200, raw.rows | 0 || 1));
  const cols = Math.max(1, Math.min(40, raw.cols | 0 || 1));
  const cells = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => String(raw.cells?.[r]?.[c] ?? "")));
  const colW = Array.from({ length: cols }, (_, c) => Number(raw.colW?.[c]) || 0);
  const merges: Merge[] = Array.isArray(raw.merges)
    ? raw.merges
        .map((m: any) => ({ r: m.r | 0, c: m.c | 0, rs: Math.max(1, m.rs | 0), cs: Math.max(1, m.cs | 0) }))
        .filter((m: Merge) => m.r >= 0 && m.c >= 0 && m.r + m.rs <= rows && m.c + m.cs <= cols && (m.rs > 1 || m.cs > 1))
    : [];
  return { ...b, ...raw, rows, cols, cells, colW, merges, style: raw.style && typeof raw.style === "object" ? raw.style : {} };
}

const shiftKeys = (style: Record<string, CellStyle>, f: (r: number, c: number) => [number, number] | null) => {
  const out: Record<string, CellStyle> = {};
  for (const k in style) {
    const [r, c] = k.split(",").map(Number);
    const n = f(r, c);
    if (n) out[keyOf(n[0], n[1])] = style[k];
  }
  return out;
};

type Axis = "r" | "c";
function adjMerges(ms: Merge[] | undefined, axis: Axis, kind: "ins" | "del", at: number): Merge[] {
  const sk = axis === "r" ? "r" : "c",
    lk = axis === "r" ? "rs" : "cs";
  const out: Merge[] = [];
  for (const m of ms ?? []) {
    const n = { ...m };
    const start = n[sk],
      span = n[lk];
    if (kind === "ins") {
      if (start >= at) n[sk] = start + 1;
      else if (start + span > at) n[lk] = span + 1;
    } else if (start > at) n[sk] = start - 1;
    else if (start === at) {
      if (span <= 1) continue;
      n[lk] = span - 1;
    } else if (start + span > at) n[lk] = span - 1;
    if (n.rs > 1 || n.cs > 1) out.push(n);
  }
  return out;
}

export function insertRow(t: TableData, at: number): TableData {
  const n = cloneTable(t);
  n.cells.splice(at, 0, Array(t.cols).fill(""));
  n.rows++;
  n.style = shiftKeys(t.style, (r, c) => [r >= at ? r + 1 : r, c]);
  n.merges = adjMerges(t.merges, "r", "ins", at);
  return n;
}
export function deleteRow(t: TableData, at: number): TableData {
  if (t.rows <= 1) return t;
  const n = cloneTable(t);
  const style = { ...t.style };
  for (const m of t.merges ?? [])
    if (m.r === at && m.rs > 1) {
      n.cells[at + 1][m.c] = n.cells[at][m.c]; // isi sel gabungan pindah ke baris berikutnya
      if (style[keyOf(at, m.c)]) style[keyOf(at + 1, m.c)] = style[keyOf(at, m.c)];
    }
  n.cells.splice(at, 1);
  n.rows--;
  n.headRows = Math.min(n.headRows, n.rows);
  n.style = shiftKeys(style, (r, c) => (r === at ? null : [r > at ? r - 1 : r, c]));
  n.merges = adjMerges(t.merges, "r", "del", at);
  return n;
}
export function insertCol(t: TableData, at: number): TableData {
  const n = cloneTable(t);
  n.cells.forEach((r) => r.splice(at, 0, ""));
  n.colW.splice(at, 0, 0);
  n.cols++;
  n.style = shiftKeys(t.style, (r, c) => [r, c >= at ? c + 1 : c]);
  n.merges = adjMerges(t.merges, "c", "ins", at);
  return n;
}
export function deleteCol(t: TableData, at: number): TableData {
  if (t.cols <= 1) return t;
  const n = cloneTable(t);
  const style = { ...t.style };
  for (const m of t.merges ?? [])
    if (m.c === at && m.cs > 1) {
      n.cells[m.r][at + 1] = n.cells[m.r][at];
      if (style[keyOf(m.r, at)]) style[keyOf(m.r, at + 1)] = style[keyOf(m.r, at)];
    }
  n.cells.forEach((r) => r.splice(at, 1));
  n.colW.splice(at, 1);
  n.cols--;
  n.headCols = Math.min(n.headCols, n.cols);
  n.style = shiftKeys(style, (r, c) => (c === at ? null : [r, c > at ? c - 1 : c]));
  n.merges = adjMerges(t.merges, "c", "del", at);
  return n;
}

// ---------------------------------------------------------------- gabung / pisah
export interface Rect {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}
/** Lebarkan persegi agar tidak memotong gabungan sel yang sudah ada. */
export function expandRect(t: TableData, R: Rect): Rect {
  let q = { ...R };
  for (let again = true; again; ) {
    again = false;
    for (const m of t.merges ?? []) {
      const m1r = m.r + m.rs - 1,
        m1c = m.c + m.cs - 1;
      if (m.r > q.r1 || m1r < q.r0 || m.c > q.c1 || m1c < q.c0) continue;
      const n = { r0: Math.min(q.r0, m.r), c0: Math.min(q.c0, m.c), r1: Math.max(q.r1, m1r), c1: Math.max(q.c1, m1c) };
      if (n.r0 !== q.r0 || n.c0 !== q.c0 || n.r1 !== q.r1 || n.c1 !== q.c1) (q = n), (again = true);
    }
  }
  return q;
}
export function mergeRect(t: TableData, R0: Rect): TableData {
  const R = expandRect(t, R0);
  if (R.r0 === R.r1 && R.c0 === R.c1) return t;
  const n = cloneTable(t);
  const parts: string[] = [];
  for (let r = R.r0; r <= R.r1; r++)
    for (let c = R.c0; c <= R.c1; c++) {
      const v = (n.cells[r][c] ?? "").trim();
      if (v) parts.push(v);
      if (r !== R.r0 || c !== R.c0) n.cells[r][c] = "";
    }
  n.cells[R.r0][R.c0] = parts.join(" ");
  n.merges = (n.merges ?? []).filter((m) => m.r > R.r1 || m.r + m.rs - 1 < R.r0 || m.c > R.c1 || m.c + m.cs - 1 < R.c0);
  n.merges.push({ r: R.r0, c: R.c0, rs: R.r1 - R.r0 + 1, cs: R.c1 - R.c0 + 1 });
  return n;
}
export function splitRect(t: TableData, R: Rect): TableData {
  const n = cloneTable(t);
  n.merges = (n.merges ?? []).filter((m) => m.r > R.r1 || m.r + m.rs - 1 < R.r0 || m.c > R.c1 || m.c + m.cs - 1 < R.c0);
  return n;
}
export const hasMergeIn = (t: TableData, R: Rect) => (t.merges ?? []).some((m) => !(m.r > R.r1 || m.r + m.rs - 1 < R.r0 || m.c > R.c1 || m.c + m.cs - 1 < R.c0));

// ---------------------------------------------------------------- gaya tabel (seperti Word)
export interface TableStyle {
  id: string;
  name: string;
  headBg: string;
  stripeBg: string;
  border: string;
  mode: StripeMode;
}
export const TABLE_STYLES: TableStyle[] = [
  { id: "biru", name: "Biru belang", headBg: "#2563eb", stripeBg: "#dbeafe", border: "#93c5fd", mode: "rows" },
  { id: "hijau", name: "Hijau belang", headBg: "#0f766e", stripeBg: "#d1fae5", border: "#6ee7b7", mode: "rows" },
  { id: "oranye", name: "Oranye belang", headBg: "#c2410c", stripeBg: "#ffedd5", border: "#fdba74", mode: "rows" },
  { id: "ungu", name: "Ungu belang", headBg: "#6d28d9", stripeBg: "#ede9fe", border: "#c4b5fd", mode: "rows" },
  { id: "abu", name: "Abu-abu", headBg: "#334155", stripeBg: "#e2e8f0", border: "#94a3b8", mode: "rows" },
  { id: "kolom", name: "Kolom belang", headBg: "#be185d", stripeBg: "#fce7f3", border: "#f9a8d4", mode: "cols" },
  { id: "catur", name: "Papan catur", headBg: "#1e293b", stripeBg: "#fef3c7", border: "#cbd5e1", mode: "both" },
  { id: "polos", name: "Polos", headBg: "#475569", stripeBg: "#f1f5f9", border: "#94a3b8", mode: "none" },
];

export function ensureSize(t: TableData, rows: number, cols: number): TableData {
  let n = t;
  while (n.cols < cols) n = insertCol(n, n.cols);
  while (n.rows < rows) n = insertRow(n, n.rows);
  return n;
}

/** Tempel data TSV (dari Excel/Word) mulai dari sel (r,c). */
export function pasteGrid(t: TableData, r0: number, c0: number, text: string): TableData {
  const rows = text.replace(/\r/g, "").replace(/\n+$/, "").split("\n").map((l) => l.split("\t"));
  let n = ensureSize(t, r0 + rows.length, c0 + Math.max(...rows.map((r) => r.length)));
  n = cloneTable(n);
  rows.forEach((row, i) => row.forEach((v, j) => (n.cells[r0 + i][c0 + j] = v.replace(/^"|"$/g, ""))));
  return n;
}

export function tableToMarkdown(sheet: Sheet): string {
  const t = sheet.table!;
  const row = (r: number) => "| " + t.cells[r].map((c) => c.replace(/\n/g, " ").replace(/\|/g, "\\|")).join(" | ") + " |";
  const lines = [`# ${sheet.title}`, "", row(0), "| " + Array(t.cols).fill("---").join(" | ") + " |"];
  for (let r = 1; r < t.rows; r++) lines.push(row(r));
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------- templat
export type TableTemplate = "blank" | "istilahi" | "lughawi";

export const TABLE_TEMPLATES: { id: TableTemplate; title: string; sub: string }[] = [
  { id: "blank", title: "Tabel kosong", sub: "4 × 4, isi sendiri atau tempel dari Word/Excel" },
  { id: "istilahi", title: "Tashrif istilahi", sub: "نَصَرَ: madhi, mudhari', mashdar, isim fa'il/maf'ul, amr, nahi, zaman/makan, alat" },
  { id: "lughawi", title: "Tashrif lughawi", sub: "نَصَرَ: 14 dhamir × madhi, mudhari', amr" },
];

export function templateTable(id: TableTemplate): TableData {
  if (id === "blank") return blankTable();
  const t = blankTable(1, 1);
  t.arFont = "amiri";
  t.fontSize = 26;
  t.headBg = "#0f766e";
  t.rtl = true;
  if (id === "istilahi") {
    const head = ["الفعل الماضي", "الفعل المضارع", "المصدر", "اسم الفاعل", "اسم المفعول", "فعل الأمر", "فعل النهي", "اسم الزمان والمكان", "اسم الآلة"];
    const verb = ["نَصَرَ", "يَنْصُرُ", "نَصْرًا", "نَاصِرٌ", "مَنْصُورٌ", "اُنْصُرْ", "لَا تَنْصُرْ", "مَنْصَرٌ", "مِنْصَرٌ"];
    const arti = ["telah menolong", "sedang/akan menolong", "pertolongan", "penolong", "yang ditolong", "tolonglah!", "janganlah menolong!", "tempat/waktu menolong", "alat untuk menolong"];
    t.rows = 3;
    t.cols = head.length;
    t.cells = [head, verb, arti];
    t.colW = Array(t.cols).fill(0);
    t.headRows = 1;
    t.headCols = 0;
    t.stripe = false;
    arti.forEach((_, c) => (t.style[keyOf(2, c)] = { size: 14, color: "#475569", bg: "#f8fafc" }));
    return t;
  }
  const dh = ["هُوَ", "هُمَا", "هُمْ", "هِيَ", "هُمَا", "هُنَّ", "أَنْتَ", "أَنْتُمَا", "أَنْتُمْ", "أَنْتِ", "أَنْتُمَا", "أَنْتُنَّ", "أَنَا", "نَحْنُ"];
  const madhi = ["نَصَرَ", "نَصَرَا", "نَصَرُوا", "نَصَرَتْ", "نَصَرَتَا", "نَصَرْنَ", "نَصَرْتَ", "نَصَرْتُمَا", "نَصَرْتُمْ", "نَصَرْتِ", "نَصَرْتُمَا", "نَصَرْتُنَّ", "نَصَرْتُ", "نَصَرْنَا"];
  const mudh = ["يَنْصُرُ", "يَنْصُرَانِ", "يَنْصُرُونَ", "تَنْصُرُ", "تَنْصُرَانِ", "يَنْصُرْنَ", "تَنْصُرُ", "تَنْصُرَانِ", "تَنْصُرُونَ", "تَنْصُرِينَ", "تَنْصُرَانِ", "تَنْصُرْنَ", "أَنْصُرُ", "نَنْصُرُ"];
  const amr = ["", "", "", "", "", "", "اُنْصُرْ", "اُنْصُرَا", "اُنْصُرُوا", "اُنْصُرِي", "اُنْصُرَا", "اُنْصُرْنَ", "", ""];
  t.rows = 15;
  t.cols = 4;
  t.cells = [["الضمير", "الماضي", "المضارع", "الأمر"], ...dh.map((d, i) => [d, madhi[i], mudh[i], amr[i]])];
  t.colW = [0, 0, 0, 0];
  t.headRows = 1;
  t.headCols = 1;
  t.stripe = true;
  return t;
}

// ---------------------------------------------------------------- konversi
/** Bentuk tabel dari kisi teks (baris pertama = header). */
export function tableFromGrid(grid: string[][]): TableData {
  const rows = Math.max(1, grid.length);
  const cols = Math.max(1, ...grid.map((r) => r.length));
  const t = blankTable(rows, cols);
  t.cells = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => grid[r]?.[c] ?? ""));
  const all = t.cells.flat().filter((x) => x.trim());
  const ar = all.filter((x) => isRtl(x)).length;
  if (all.length && ar / all.length > 0.5) {
    t.rtl = true;
    t.fontSize = 24;
    t.headBg = "#0f766e";
  } else t.fontSize = 18;
  return t;
}

/** Ubah peta menjadi tabel: "path" = satu kolom per tingkat; "branch" = satu kolom per cabang utama. */
export function mapToTable(sheet: Sheet, mode: "path" | "branch"): TableData | null {
  const N = sheet.nodes;
  const root = N[sheet.rootId];
  if (!root) return null;
  const kids = (id: string) => (N[id]?.children ?? []).filter((c) => N[c]);
  const txt = (id: string) => N[id].text.trim();
  if (mode === "branch") {
    const heads = kids(sheet.rootId);
    if (heads.length && heads.some((h) => kids(h).length)) {
      const cols = heads.map((h) => kids(h));
      const n = Math.max(...cols.map((c) => c.length));
      const grid = [heads.map(txt), ...Array.from({ length: n }, (_, r) => cols.map((c) => (c[r] ? txt(c[r]) : "")))];
      return tableFromGrid(grid);
    }
  }
  const paths: string[][] = [];
  const walk = (id: string, stack: string[]) => {
    const k = kids(id);
    if (!k.length) {
      if (stack.length) paths.push(stack);
      return;
    }
    k.forEach((c) => walk(c, [...stack, txt(c)]));
  };
  walk(sheet.rootId, []);
  if (!paths.length) return tableFromGrid([[txt(sheet.rootId)]]);
  const depth = Math.max(...paths.map((p) => p.length));
  const grid: string[][] = [Array.from({ length: depth }, (_, i) => `Tingkat ${i + 1}`)];
  paths.forEach((p, r) => {
    grid.push(
      Array.from({ length: depth }, (_, c) => {
        if (c >= p.length) return "";
        const prev = paths[r - 1];
        return prev && prev.length > c && prev.slice(0, c + 1).every((v, i) => v === p[i]) ? "" : p[c];
      })
    );
  });
  return tableFromGrid(grid);
}

/** Urai CSV/TSV (otomatis mendeteksi pemisah; mendukung tanda kutip). */
export function parseDelimited(text: string): string[][] {
  const src = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const first = src.split("\n").find((l) => l.trim()) ?? "";
  const count = (ch: string) => first.split(ch).length - 1;
  const delim = count("\t") > 0 ? "\t" : count(";") > count(",") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [],
    cur = "",
    q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"' && src[i + 1] === '"') (cur += '"', i++);
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"' && cur === "") q = true;
    else if (ch === delim) (row.push(cur), (cur = ""));
    else if (ch === "\n") (row.push(cur), rows.push(row), (row = []), (cur = ""));
    else cur += ch;
  }
  if (cur !== "" || row.length) (row.push(cur), rows.push(row));
  while (rows.length && rows[rows.length - 1].every((c) => !c.trim())) rows.pop();
  return rows;
}
