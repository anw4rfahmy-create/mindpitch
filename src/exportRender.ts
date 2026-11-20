// Penggambar ekspor: satu halaman (PNG/PDF/SVG) dengan ukuran, bingkai, dan judul pilihan.
import { computeLayout, LayoutResult } from "./layout";
import { edgeWidth, radiusFor, styleFor } from "./nodeStyle";
import { familyCss } from "./fonts";
import { canvasPattern, patternDef } from "./patterns";
import { fileDataUrl, loadImage } from "./files";
import { Sheet } from "./types";
import { drawTable, ensureTableFonts, tableSvg } from "./table";

export type FrameId = "none" | "line" | "thick" | "double" | "round" | "dashed" | "corners" | "band" | "diamond";

export const FRAMES: { id: FrameId; label: string }[] = [
  { id: "none", label: "Tanpa" },
  { id: "line", label: "Garis" },
  { id: "thick", label: "Tebal" },
  { id: "double", label: "Ganda" },
  { id: "round", label: "Bulat" },
  { id: "dashed", label: "Putus-putus" },
  { id: "corners", label: "Sudut" },
  { id: "band", label: "Pita warna" },
  { id: "diamond", label: "Berlian" },
];

export const PAPERS: { id: string; label: string; w: number; h: number }[] = [
  { id: "A3", label: "A3", w: 297, h: 420 },
  { id: "A4", label: "A4", w: 210, h: 297 },
  { id: "A5", label: "A5", w: 148, h: 210 },
  { id: "B4", label: "B4", w: 250, h: 353 },
  { id: "B5", label: "B5", w: 176, h: 250 },
  { id: "Letter", label: "Letter", w: 215.9, h: 279.4 },
  { id: "Legal", label: "Legal", w: 215.9, h: 355.6 },
];

export const RATIOS: { id: string; label: string; r: number | null }[] = [
  { id: "auto", label: "Otomatis", r: null },
  { id: "1:1", label: "1:1", r: 1 },
  { id: "3:4", label: "3:4", r: 3 / 4 },
  { id: "4:3", label: "4:3", r: 4 / 3 },
  { id: "2:3", label: "2:3", r: 2 / 3 },
  { id: "3:2", label: "3:2", r: 3 / 2 },
  { id: "9:16", label: "9:16", r: 9 / 16 },
  { id: "16:9", label: "16:9", r: 16 / 9 },
  { id: "4:5", label: "4:5", r: 4 / 5 },
  { id: "a4", label: "A4 (1:1,41)", r: 210 / 297 },
];

export interface ExportOpts {
  format: "png" | "pdf" | "svg";
  paper: string; // PDF
  orientation: "auto" | "portrait" | "landscape";
  ratio: string; // PNG & SVG
  frame: FrameId;
  frameColor: string;
  title: boolean;
  quality: 1 | 2; // 1 = normal, 2 = tinggi
  scope: "sheet" | "all"; // PDF
  transparent: boolean; // PNG tanpa latar
}

export const defaultExportOpts = (): ExportOpts => ({
  format: "png",
  paper: "A4",
  orientation: "auto",
  ratio: "auto",
  frame: "none",
  frameColor: "#334155",
  title: false,
  quality: 1,
  scope: "sheet",
  transparent: false,
});

// ---------------------------------------------------------------- ukuran halaman
export function pageSize(sheet: Sheet, lay: LayoutResult, o: ExportOpts, long = 0): { w: number; h: number; ptW?: number; ptH?: number } {
  const b = lay.bounds;
  const contentRatio = b.w / Math.max(1, b.h);
  const hi = o.quality === 2;
  if (o.format === "pdf") {
    const p = PAPERS.find((x) => x.id === o.paper) ?? PAPERS[1];
    let landscape = o.orientation === "landscape";
    if (o.orientation === "auto") landscape = contentRatio > 1;
    const mmW = landscape ? p.h : p.w,
      mmH = landscape ? p.w : p.h;
    const dpi = long ? (long / Math.max(mmW, mmH)) * 25.4 : hi ? 220 : 150;
    return { w: Math.round((mmW / 25.4) * dpi), h: Math.round((mmH / 25.4) * dpi), ptW: (mmW / 25.4) * 72, ptH: (mmH / 25.4) * 72 };
  }
  const base = long || (hi ? 3200 : 2000);
  const rr = RATIOS.find((r) => r.id === o.ratio)?.r ?? null;
  const ratio = rr ?? Math.min(2.2, Math.max(0.55, contentRatio * 1.0));
  if (ratio >= 1) return { w: base, h: Math.round(base / ratio) };
  return { w: Math.round(base * ratio), h: base };
}

// ---------------------------------------------------------------- bingkai (jalur, dipakai untuk kanvas & SVG)
interface Prim {
  d: string;
  stroke?: string;
  width?: number;
  fill?: string;
  dash?: number[];
  cap?: "round" | "butt" | "square";
}

const rr = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r},${y} H${x + w - r} A${r},${r} 0 0 1 ${x + w},${y + r} V${y + h - r} A${r},${r} 0 0 1 ${x + w - r},${y + h} H${x + r} A${r},${r} 0 0 1 ${x},${y + h - r} V${y + r} A${r},${r} 0 0 1 ${x + r},${y} Z`;
const rect = (x: number, y: number, w: number, h: number) => `M${x},${y} H${x + w} V${y + h} H${x} Z`;

export function framePrims(id: FrameId, W: number, H: number, color: string): Prim[] {
  const u = Math.min(W, H) / 100; // satuan relatif
  const m = u * 2.6;
  if (id === "none") return [];
  if (id === "line") return [{ d: rect(m, m, W - 2 * m, H - 2 * m), stroke: color, width: u * 0.35 }];
  if (id === "thick") return [{ d: rr(m, m, W - 2 * m, H - 2 * m, u * 1.2), stroke: color, width: u * 1.3 }];
  if (id === "double")
    return [
      { d: rect(m, m, W - 2 * m, H - 2 * m), stroke: color, width: u * 0.9 },
      { d: rect(m + u * 1.6, m + u * 1.6, W - 2 * (m + u * 1.6), H - 2 * (m + u * 1.6)), stroke: color, width: u * 0.3 },
    ];
  if (id === "round") return [{ d: rr(m, m, W - 2 * m, H - 2 * m, u * 4), stroke: color, width: u * 0.55 }];
  if (id === "dashed") return [{ d: rr(m, m, W - 2 * m, H - 2 * m, u * 1.5), stroke: color, width: u * 0.5, dash: [u * 1.6, u * 1.1], cap: "round" }];
  if (id === "corners") {
    const L = u * 9;
    const x0 = m,
      y0 = m,
      x1 = W - m,
      y1 = H - m;
    return [
      {
        d: `M${x0},${y0 + L} V${y0} H${x0 + L} M${x1 - L},${y0} H${x1} V${y0 + L} M${x1},${y1 - L} V${y1} H${x1 - L} M${x0 + L},${y1} H${x0} V${y1 - L}`,
        stroke: color,
        width: u * 0.9,
        cap: "square",
      },
    ];
  }
  if (id === "band") {
    const t = u * 2.2;
    return [
      { d: rect(t / 2, t / 2, W - t, H - t), stroke: color, width: t },
      { d: rect(t + u * 1.2, t + u * 1.2, W - 2 * (t + u * 1.2), H - 2 * (t + u * 1.2)), stroke: color, width: u * 0.25 },
    ];
  }
  // berlian: dua garis tipis + deretan belah ketupat di antaranya
  const o1 = m,
    o2 = m + u * 2.4;
  const prims: Prim[] = [
    { d: rect(o1, o1, W - 2 * o1, H - 2 * o1), stroke: color, width: u * 0.3 },
    { d: rect(o2, o2, W - 2 * o2, H - 2 * o2), stroke: color, width: u * 0.3 },
  ];
  const s = u * 0.7;
  const mid = (o1 + o2) / 2;
  let d = "";
  const diamond = (cx: number, cy: number) => `M${cx},${cy - s} L${cx + s},${cy} L${cx},${cy + s} L${cx - s},${cy} Z `;
  const step = u * 3.2;
  for (let x = o2 + step; x < W - o2 - step / 2; x += step) d += diamond(x, mid) + diamond(x, H - mid);
  for (let y = o2 + step; y < H - o2 - step / 2; y += step) d += diamond(mid, y) + diamond(W - mid, y);
  for (const [cx, cy] of [
    [mid, mid],
    [W - mid, mid],
    [mid, H - mid],
    [W - mid, H - mid],
  ])
    d += diamond(cx, cy);
  prims.push({ d, fill: color });
  return prims;
}

function drawPrims(ctx: CanvasRenderingContext2D, prims: Prim[]) {
  for (const p of prims) {
    ctx.save();
    const path = new Path2D(p.d);
    if (p.fill) {
      ctx.fillStyle = p.fill;
      ctx.fill(path);
    }
    if (p.stroke) {
      ctx.strokeStyle = p.stroke;
      ctx.lineWidth = p.width ?? 1;
      ctx.lineCap = p.cap ?? "butt";
      ctx.lineJoin = "miter";
      ctx.setLineDash(p.dash ?? []);
      ctx.stroke(path);
    }
    ctx.restore();
  }
}

const primsSvg = (prims: Prim[]) =>
  prims
    .map(
      (p) =>
        `<path d="${p.d}" fill="${p.fill ?? "none"}"${p.stroke ? ` stroke="${p.stroke}" stroke-width="${p.width}"` : ""}${p.dash ? ` stroke-dasharray="${p.dash.join(" ")}"` : ""}${p.cap ? ` stroke-linecap="${p.cap}"` : ""}/>`
    )
    .join("");

// ---------------------------------------------------------------- isi peta (koordinat tata letak)
export async function drawContent(ctx: CanvasRenderingContext2D, sheet: Sheet, lay: LayoutResult) {
  if (sheet.table) {
    drawTable(ctx, sheet);
    return;
  }
  for (const f of sheet.floats) {
    const im = await loadImage(f.fileId);
    if (im) ctx.drawImage(im, f.x, f.y, f.w, f.h);
  }
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const e of lay.edges) {
    const owner = lay.nodes[e.childId];
    ctx.strokeStyle = e.kind === "axis" ? "#334155" : styleFor(sheet, sheet.nodes[e.childId], owner.depth).branch;
    ctx.lineWidth = e.kind === "axis" ? 4 : edgeWidth(sheet, e.kind === "brace" ? owner.depth + 1 : owner.depth);
    ctx.stroke(new Path2D(e.d));
  }
  for (const id of lay.order) {
    const ln = lay.nodes[id];
    const st = styleFor(sheet, sheet.nodes[id], ln.depth);
    ctx.save();
    ctx.translate(ln.x, ln.y);
    if (st.shape === "line") {
      ctx.strokeStyle = st.stroke;
      ctx.lineWidth = st.strokeWidth;
      ctx.beginPath();
      ctx.moveTo(0, ln.h);
      ctx.lineTo(ln.w, ln.h);
      ctx.stroke();
    } else if (st.shape !== "none") {
      const shapePath = () => {
        ctx.beginPath();
        if (st.shape === "ellipse") ctx.ellipse(ln.w / 2, ln.h / 2, ln.w / 2, ln.h / 2, 0, 0, Math.PI * 2);
        else ctx.roundRect(0, 0, ln.w, ln.h, radiusFor(st.shape, ln.h));
      };
      shapePath();
      if (st.fill !== "none") {
        ctx.fillStyle = st.fill;
        ctx.fill();
      }
      if (st.pattern) {
        const pat = canvasPattern(ctx, st.pattern, st.patternColor);
        if (pat) {
          ctx.save();
          shapePath();
          ctx.clip();
          ctx.translate(-ln.x, -ln.y); // pola mengikuti koordinat dunia
          ctx.fillStyle = pat;
          ctx.fillRect(ln.x - 2, ln.y - 2, ln.w + 4, ln.h + 4);
          ctx.restore();
        }
      }
      if (st.stroke !== "none") {
        shapePath();
        ctx.strokeStyle = st.stroke;
        ctx.lineWidth = st.strokeWidth;
        ctx.stroke();
      }
    }
    if (ln.img) {
      const im = await loadImage(ln.img.fileId);
      if (im) ctx.drawImage(im, ln.img.x, ln.img.y, ln.img.w, ln.img.h);
    }
    ctx.fillStyle = st.text;
    ctx.font = ln.font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.direction = ln.rtl ? "rtl" : "ltr";
    ln.lines.forEach((l, i) => ctx.fillText(l, ln.w / 2, ln.textTop + ln.lineH * (i + 0.5)));
    ctx.restore();
  }
  for (const id of lay.order) {
    const ln = lay.nodes[id];
    if (!ln.badge || !ln.hasHidden) continue;
    const color = styleFor(sheet, sheet.nodes[id], ln.depth).branch;
    ctx.beginPath();
    ctx.arc(ln.badge.x, ln.badge.y, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ln.badge.x - 3.2, ln.badge.y);
    ctx.lineTo(ln.badge.x + 3.2, ln.badge.y);
    ctx.moveTo(ln.badge.x, ln.badge.y - 3.2);
    ctx.lineTo(ln.badge.x, ln.badge.y + 3.2);
    ctx.stroke();
  }
}

/** Kotak area isi di dalam bingkai, relatif terhadap halaman W×H. */
function contentBox(W: number, H: number, o: ExportOpts) {
  const u = Math.min(W, H) / 100;
  const inset = (o.frame === "none" ? 3.5 : o.frame === "diamond" ? 9.2 : o.frame === "band" ? 8 : o.frame === "double" ? 8 : 7) * u;
  const titleH = o.title ? u * 8 : 0;
  return { x: inset, y: inset + titleH, w: W - 2 * inset, h: H - 2 * inset - titleH, inset, u, titleH };
}

function fitTransform(lay: LayoutResult, box: { x: number; y: number; w: number; h: number; u: number }, W: number) {
  const b = lay.bounds;
  const cap = (W / 1000) * 2.4; // jangan membesarkan peta kecil secara berlebihan
  const k = Math.min(box.w / Math.max(1, b.w), box.h / Math.max(1, b.h), cap);
  return { k, tx: box.x + (box.w - b.w * k) / 2 - b.x * k, ty: box.y + (box.h - b.h * k) / 2 - b.y * k };
}

export async function renderPage(sheet: Sheet, o: ExportOpts, size: { w: number; h: number }, title?: string): Promise<HTMLCanvasElement> {
  await ensureTableFonts(sheet);
  const lay = computeLayout(sheet);
  const { w: W, h: H } = size;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;
  if (!(o.format === "png" && o.transparent)) {
    ctx.fillStyle = sheet.bg.color;
    ctx.fillRect(0, 0, W, H);
    if (sheet.bg.imageId) {
      const bi = await loadImage(sheet.bg.imageId);
      if (bi) {
        if (sheet.bg.fit === "tile") {
          const pat = ctx.createPattern(bi, "repeat");
          if (pat) {
            ctx.fillStyle = pat;
            ctx.fillRect(0, 0, W, H);
          }
        } else {
          const k = (sheet.bg.fit === "cover" ? Math.max : Math.min)(W / bi.naturalWidth, H / bi.naturalHeight);
          ctx.drawImage(bi, (W - bi.naturalWidth * k) / 2, (H - bi.naturalHeight * k) / 2, bi.naturalWidth * k, bi.naturalHeight * k);
        }
      }
    }
  }
  drawPrims(ctx, framePrims(o.frame, W, H, o.frameColor));
  const box = contentBox(W, H, o);
  if (o.title && title) {
    ctx.save();
    ctx.fillStyle = "#0f172a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${box.u * 3.2}px ${familyCss(sheet.font)}`;
    ctx.fillText(title, W / 2, box.inset + box.titleH / 2, W - box.inset * 2);
    ctx.restore();
  }
  const t = fitTransform(lay, box, W);
  ctx.save();
  ctx.translate(t.tx, t.ty);
  ctx.scale(t.k, t.k);
  await drawContent(ctx, sheet, lay);
  ctx.restore();
  return cv;
}

export async function renderBlob(sheet: Sheet, o: ExportOpts, type: "image/png" | "image/jpeg", title?: string, longSide = 0): Promise<{ blob: Blob; w: number; h: number; ptW?: number; ptH?: number }> {
  await ensureTableFonts(sheet);
  const lay = computeLayout(sheet);
  const size = pageSize(sheet, lay, o, longSide);
  const cv = await renderPage(sheet, o, size, title);
  const blob = await new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("Gagal membuat gambar"))), type, 0.92));
  return { blob, ...size };
}

// ---------------------------------------------------------------- SVG
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function renderSvg(sheet: Sheet, o: ExportOpts, title?: string): Promise<string> {
  await ensureTableFonts(sheet);
  const lay = computeLayout(sheet);
  const size = pageSize(sheet, lay, o, 1600);
  const { w: W, h: H } = size;
  const box = contentBox(W, H, o);
  const t = fitTransform(lay, box, W);
  const P: string[] = [];
  const defs = new Map<string, string>();
  for (const id of lay.order) {
    const st = styleFor(sheet, sheet.nodes[id], lay.nodes[id].depth);
    if (st.pattern) defs.set(st.pattern + st.patternColor, patternDef(st.pattern, st.patternColor));
  }
  P.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${[...defs.values()].join("")}</defs>`);
  if (!(o.format === "png" && o.transparent)) P.push(`<rect width="${W}" height="${H}" fill="${sheet.bg.color}"/>`);
  if (sheet.bg.imageId && sheet.bg.fit !== "tile") {
    const u = await fileDataUrl(sheet.bg.imageId);
    if (u) P.push(`<image href="${u}" width="${W}" height="${H}" preserveAspectRatio="${sheet.bg.fit === "cover" ? "xMidYMid slice" : "xMidYMid meet"}"/>`);
  }
  P.push(primsSvg(framePrims(o.frame, W, H, o.frameColor)));
  if (o.title && title)
    P.push(`<text x="${W / 2}" y="${box.inset + box.titleH / 2}" text-anchor="middle" dominant-baseline="central" font-family="${familyCss(sheet.font).replace(/"/g, "'")}" font-weight="700" font-size="${box.u * 3.2}" fill="#0f172a">${esc(title)}</text>`);
  P.push(`<g transform="translate(${t.tx},${t.ty}) scale(${t.k})">`);
  if (sheet.table) P.push(tableSvg(sheet));
  else {
  for (const f of sheet.floats) {
    const u = await fileDataUrl(f.fileId);
    if (u) P.push(`<image href="${u}" x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" preserveAspectRatio="none"/>`);
  }
  for (const e of lay.edges) {
    const owner = lay.nodes[e.childId];
    const col = e.kind === "axis" ? "#334155" : styleFor(sheet, sheet.nodes[e.childId], owner.depth).branch;
    const wd = e.kind === "axis" ? 4 : edgeWidth(sheet, e.kind === "brace" ? owner.depth + 1 : owner.depth);
    P.push(`<path d="${e.d}" fill="none" stroke="${col}" stroke-width="${wd}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  for (const id of lay.order) {
    const ln = lay.nodes[id];
    const n = sheet.nodes[id];
    const st = styleFor(sheet, n, ln.depth);
    P.push(`<g transform="translate(${ln.x},${ln.y})">`);
    const shapeEl = (extra: string) =>
      st.shape === "ellipse"
        ? `<ellipse cx="${ln.w / 2}" cy="${ln.h / 2}" rx="${ln.w / 2}" ry="${ln.h / 2}" ${extra}/>`
        : `<rect width="${ln.w}" height="${ln.h}" rx="${radiusFor(st.shape, ln.h)}" ${extra}/>`;
    if (st.shape === "line") P.push(`<line x1="0" y1="${ln.h}" x2="${ln.w}" y2="${ln.h}" stroke="${st.stroke}" stroke-width="${st.strokeWidth}" stroke-linecap="round"/>`);
    else if (st.shape !== "none") {
      P.push(shapeEl(`fill="${st.fill}"`));
      if (st.pattern) P.push(shapeEl(`fill="url(#pt-${st.pattern}-${st.patternColor.replace(/[^a-z0-9]/gi, "")})"`));
      P.push(shapeEl(`fill="none" stroke="${st.stroke}" stroke-width="${st.strokeWidth}"`));
    }
    if (ln.img) {
      const u = await fileDataUrl(ln.img.fileId);
      if (u) P.push(`<image href="${u}" x="${ln.img.x}" y="${ln.img.y}" width="${ln.img.w}" height="${ln.img.h}" preserveAspectRatio="xMidYMid slice"/>`);
    }
    const fam = familyCss(n.font ?? sheet.font).replace(/"/g, "'");
    const weight = /(\d{3})\s/.exec(ln.font)?.[1] ?? "400";
    ln.lines.forEach((l, i) =>
      P.push(
        `<text x="${ln.w / 2}" y="${ln.textTop + ln.lineH * (i + 0.5)}" text-anchor="middle" dominant-baseline="central" direction="${ln.rtl ? "rtl" : "ltr"}" fill="${st.text}" font-family="${fam}" font-size="${ln.fontSize}" font-weight="${weight}"${n.italic ? ' font-style="italic"' : ""}>${esc(l)}</text>`
      )
    );
    P.push(`</g>`);
  }
  }
  P.push(`</g></svg>`);
  return P.join("");
}

// ---------------------------------------------------------------- PDF (halaman gambar JPEG)
export interface PdfPage {
  jpeg: Uint8Array;
  pxW: number;
  pxH: number;
  ptW: number;
  ptH: number;
}

export function buildPdf(pages: PdfPage[], title = "MindPitch"): Blob {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let pos = 0;
  const push = (d: Uint8Array | string) => {
    const b = typeof d === "string" ? enc.encode(d) : d;
    chunks.push(b);
    pos += b.length;
  };
  const begin = (n: number) => {
    offsets[n] = pos;
    push(`${n} 0 obj\n`);
  };
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const nObj = 2 + pages.length * 3 + 1;
  begin(1);
  push("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  begin(2);
  push(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ")}] >>\nendobj\n`);
  pages.forEach((p, i) => {
    const pg = 3 + i * 3,
      ct = pg + 1,
      im = pg + 2;
    const f = (x: number) => x.toFixed(2);
    begin(pg);
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(p.ptW)} ${f(p.ptH)}] /Resources << /XObject << /Im0 ${im} 0 R >> >> /Contents ${ct} 0 R >>\nendobj\n`);
    const content = `q ${f(p.ptW)} 0 0 ${f(p.ptH)} 0 0 cm /Im0 Do Q`;
    begin(ct);
    push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
    begin(im);
    push(`<< /Type /XObject /Subtype /Image /Width ${p.pxW} /Height ${p.pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
    push(p.jpeg);
    push("\nendstream\nendobj\n");
  });
  const infoN = nObj;
  begin(infoN);
  push(`<< /Title (${title.replace(/[()\\]/g, "").replace(/[^\x20-\x7E]/g, "?")}) /Producer (MindPitch) >>\nendobj\n`);
  const xref = pos;
  push(`xref\n0 ${nObj + 1}\n0000000000 65535 f \n`);
  for (let i = 1; i <= nObj; i++) push(String(offsets[i]).padStart(10, "0") + " 00000 n \n");
  push(`trailer\n<< /Size ${nObj + 1} /Root 1 0 R /Info ${infoN} 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks as BlobPart[], { type: "application/pdf" });
}

export async function renderPdf(sheets: Sheet[], o: ExportOpts, docTitle: string): Promise<Blob> {
  const pages: PdfPage[] = [];
  for (const s of sheets) {
    const r = await renderBlob(s, o, "image/jpeg", o.title ? s.title : undefined);
    pages.push({ jpeg: new Uint8Array(await r.blob.arrayBuffer()), pxW: r.w, pxH: r.h, ptW: r.ptW!, ptH: r.ptH! });
  }
  return buildPdf(pages, docTitle);
}

/** Pratinjau kecil bingkai (SVG) untuk pemilih bingkai. */
export function framePreviewSvg(id: FrameId, w: number, h: number, color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#fff"/>${primsSvg(framePrims(id, w, h, color))}<rect x="${w * 0.3}" y="${h * 0.42}" width="${w * 0.4}" height="${h * 0.16}" rx="3" fill="#cbd5e1"/></svg>`;
}
