// Lembar tabel: geometri, penggambaran (kanvas & SVG), operasi baris/kolom, dan templat.
import { ensureFonts, familyCss, fontString, isRtl } from "./fonts";
import { textWidth, wrapCached } from "./measure";
import { contrastText } from "./nodeStyle";
import { CellStyle, Sheet, TableData } from "./types";

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

export function resolveCell(t: TableData, r: number, c: number): ResolvedCell {
  const st: CellStyle = t.style[keyOf(r, c)] ?? {};
  const head = r < t.headRows || c < t.headCols;
  const stripe = t.stripe && !head && (r - t.headRows) % 2 === 1;
  const bg = st.bg ?? (head ? t.headBg : stripe ? "#f1f5fb" : "#ffffff");
  const color = st.color ?? contrastText(bg);
  return { bg, color, bold: st.bold ?? head, align: st.align ?? "c", size: st.size ?? t.fontSize };
}

export const cellFontId = (t: TableData, text: string) => (isRtl(text) ? t.arFont : t.font);
export const cellLineH = (size: number, rtl: boolean) => Math.round(size * (rtl ? 1.8 : 1.45));

export interface TCell {
  r: number;
  c: number;
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
}

export function tableGeom(sheet: Sheet): TGeom {
  const t = sheet.table!;
  const colW: number[] = [];
  for (let c = 0; c < t.cols; c++) {
    if (t.colW[c] > 0) {
      colW[c] = t.colW[c];
      continue;
    }
    let m = 0;
    for (let r = 0; r < t.rows; r++) {
      const txt = t.cells[r]?.[c] ?? "";
      const res = resolveCell(t, r, c);
      const font = fontString(cellFontId(t, txt), res.bold ? 700 : 400, res.size);
      for (const l of txt.split("\n")) m = Math.max(m, textWidth(font, l));
    }
    colW[c] = Math.min(320, Math.max(72, Math.ceil(m) + PAD_X * 2 + 4));
  }
  const rowH: number[] = [];
  const raw: TCell[] = [];
  for (let r = 0; r < t.rows; r++) {
    let h = 0;
    for (let c = 0; c < t.cols; c++) {
      const txt = t.cells[r]?.[c] ?? "";
      const res = resolveCell(t, r, c);
      const id = cellFontId(t, txt);
      const rtl = isRtl(txt);
      const font = fontString(id, res.bold ? 700 : 400, res.size);
      const lines = wrapCached(font, txt, colW[c] - PAD_X * 2);
      const lineH = cellLineH(res.size, rtl);
      h = Math.max(h, lines.length * lineH + PAD_Y * 2);
      raw.push({ r, c, x: 0, y: 0, w: colW[c], h: 0, lines, font, fam: familyCss(id), rtl, lineH, res });
    }
    rowH[r] = Math.max(h, 40);
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
    k.x = xs[k.c];
    k.y = ys[k.r];
    k.h = rowH[k.r];
  }
  return { w: total, h: ya, cells: raw };
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
  return { ...b, ...raw, rows, cols, cells, colW, style: raw.style && typeof raw.style === "object" ? raw.style : {} };
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

export function insertRow(t: TableData, at: number): TableData {
  const n = cloneTable(t);
  n.cells.splice(at, 0, Array(t.cols).fill(""));
  n.rows++;
  n.style = shiftKeys(t.style, (r, c) => [r >= at ? r + 1 : r, c]);
  return n;
}
export function deleteRow(t: TableData, at: number): TableData {
  if (t.rows <= 1) return t;
  const n = cloneTable(t);
  n.cells.splice(at, 1);
  n.rows--;
  n.headRows = Math.min(n.headRows, n.rows);
  n.style = shiftKeys(t.style, (r, c) => (r === at ? null : [r > at ? r - 1 : r, c]));
  return n;
}
export function insertCol(t: TableData, at: number): TableData {
  const n = cloneTable(t);
  n.cells.forEach((r) => r.splice(at, 0, ""));
  n.colW.splice(at, 0, 0);
  n.cols++;
  n.style = shiftKeys(t.style, (r, c) => [r, c >= at ? c + 1 : c]);
  return n;
}
export function deleteCol(t: TableData, at: number): TableData {
  if (t.cols <= 1) return t;
  const n = cloneTable(t);
  n.cells.forEach((r) => r.splice(at, 1));
  n.colW.splice(at, 1);
  n.cols--;
  n.headCols = Math.min(n.headCols, n.cols);
  n.style = shiftKeys(t.style, (r, c) => (c === at ? null : [r, c > at ? c - 1 : c]));
  return n;
}

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
