import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { computeLayout } from "./layout";
import { addChild, newSheet, normalizeWorkbook, uid, activeSheet } from "./model";
import { edgeWidth, radiusFor, styleFor } from "./nodeStyle";
import { fontById, familyCss } from "./fonts";
import { fileDataUrl, filesOfDoc, guessMime, loadImage, putFile, blobToDataUrl, getFile } from "./files";
import { Sheet, Workbook } from "./types";

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const safeName = (s: string) =>
  (s || "peta").replace(/[\\/:*?"<>|]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "peta";

// ---------- berkas .mindpitch (zip: workbook.json + files/<id>) ----------
export async function toMindpitch(wb: Workbook): Promise<Blob> {
  const files = await filesOfDoc(wb.id);
  const entries: Record<string, Uint8Array> = {
    "workbook.json": strToU8(JSON.stringify({ app: "mindpitch", version: 2, workbook: wb, files: files.map((f) => ({ id: f.id, name: f.name, type: f.type })) })),
  };
  for (const f of files) entries["files/" + f.id] = new Uint8Array(await f.blob.arrayBuffer());
  const zipped = zipSync(entries, { level: 0 });
  return new Blob([zipped as BlobPart], { type: "application/zip" });
}

/** Impor .mindpitch / .json / .md / .txt. Berkas lampiran ditulis ke IndexedDB dengan id dokumen baru. */
export async function importFile(file: File): Promise<Workbook | null> {
  const name = file.name.toLowerCase();
  try {
    if (name.endsWith(".mindpitch") || name.endsWith(".zip")) {
      const z = unzipSync(new Uint8Array(await file.arrayBuffer()));
      const meta = JSON.parse(strFromU8(z["workbook.json"]));
      const wb = normalizeWorkbook(meta.workbook);
      if (!wb) return null;
      const newId = uid();
      for (const f of meta.files ?? []) {
        const data = z["files/" + f.id];
        if (data) await putFile(newId, new Blob([data as BlobPart], { type: f.type }), f.name, f.type, f.id);
      }
      wb.id = newId;
      return wb;
    }
    const text = await file.text();
    if (name.endsWith(".json")) {
      const raw = JSON.parse(text);
      const wb = normalizeWorkbook(raw.workbook ?? raw.doc ?? raw);
      if (wb) wb.id = uid();
      return wb;
    }
    return fromMarkdown(text, file.name.replace(/\.[^.]+$/, ""));
  } catch {
    return null;
  }
}

// ---------- Markdown ----------
export function sheetToMarkdown(sheet: Sheet): string {
  const lines: string[] = [];
  const root = sheet.nodes[sheet.rootId];
  lines.push(`# ${root.text.replace(/\n/g, " ")}`, "");
  if (root.note) lines.push(`> ${root.note.replace(/\n/g, " ")}`, "");
  const walk = (id: string, depth: number) => {
    const n = sheet.nodes[id];
    lines.push(`${"  ".repeat(depth)}- ${n.text.replace(/\n/g, " ")}`);
    if (n.note) lines.push(`${"  ".repeat(depth + 1)}> ${n.note.replace(/\n/g, " ")}`);
    n.children.forEach((c) => sheet.nodes[c] && walk(c, depth + 1));
  };
  root.children.forEach((c) => sheet.nodes[c] && walk(c, 0));
  return lines.join("\n") + "\n";
}

export const toMarkdown = (wb: Workbook) => sheetToMarkdown(activeSheet(wb));

export function fromMarkdown(text: string, fallbackTitle = "Peta impor"): Workbook | null {
  const items: { level: number; text: string }[] = [];
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    if (!raw.trim()) continue;
    const h = /^(#{1,6})\s+(.*)$/.exec(raw);
    if (h) {
      items.push({ level: h[1].length, text: h[2].trim() });
      continue;
    }
    const b = /^(\s*)[-*+]\s+(.*)$/.exec(raw) ?? /^(\s*)\d+[.)]\s+(.*)$/.exec(raw);
    if (b) {
      const indent = b[1].replace(/\t/g, "  ").length;
      items.push({ level: 2 + Math.floor(indent / 2) + (items.some((i) => i.level === 1) ? 0 : 0), text: b[2].trim() });
      continue;
    }
    if (raw.trim().startsWith(">")) continue;
    items.push({ level: 99, text: raw.trim() });
  }
  if (!items.length) return null;
  // baris biasa → anak dari level terakhir
  let lastLevel = 1;
  for (const it of items) {
    if (it.level === 99) it.level = lastLevel + 1;
    else lastLevel = it.level;
  }
  const sheet = newSheet(fallbackTitle, fallbackTitle);
  let nodes = sheet.nodes;
  let startIdx = 0;
  let title = fallbackTitle;
  if (items[0].level === 1) {
    nodes = { ...nodes, [sheet.rootId]: { ...nodes[sheet.rootId], text: items[0].text } };
    title = items[0].text;
    startIdx = 1;
  }
  const stack: { level: number; id: string }[] = [{ level: 1, id: sheet.rootId }];
  for (let i = startIdx; i < items.length; i++) {
    const level = Math.max(2, items[i].level);
    while (stack.length > 1 && stack[stack.length - 1].level >= level) stack.pop();
    const parent = stack[stack.length - 1];
    const r = addChild(nodes, parent.id, items[i].text);
    nodes = r.nodes;
    stack.push({ level, id: r.id });
  }
  sheet.nodes = nodes;
  sheet.title = title.slice(0, 40);
  const now = Date.now();
  return { id: uid(), title, sheets: [sheet], activeId: sheet.id, createdAt: now, updatedAt: now };
}

// ---------- gambar: PNG digambar langsung di kanvas (font aplikasi ikut terpakai) ----------
export async function sheetToPngBlob(sheet: Sheet, scale = 2): Promise<Blob> {
  const lay = computeLayout(sheet);
  const pad = 40;
  const b = lay.bounds;
  const w = Math.ceil(b.w + pad * 2),
    h = Math.ceil(b.h + pad * 2);
  const s = Math.min(scale, 8192 / Math.max(w, h));
  const cv = document.createElement("canvas");
  cv.width = Math.round(w * s);
  cv.height = Math.round(h * s);
  const ctx = cv.getContext("2d")!;
  ctx.scale(s, s);
  ctx.fillStyle = sheet.bg.color;
  ctx.fillRect(0, 0, w, h);
  if (sheet.bg.imageId) {
    const bi = await loadImage(sheet.bg.imageId);
    if (bi) {
      if (sheet.bg.fit === "tile") {
        const pat = ctx.createPattern(bi, "repeat");
        if (pat) {
          ctx.fillStyle = pat;
          ctx.fillRect(0, 0, w, h);
        }
      } else {
        const k = (sheet.bg.fit === "cover" ? Math.max : Math.min)(w / bi.naturalWidth, h / bi.naturalHeight);
        const dw = bi.naturalWidth * k,
          dh = bi.naturalHeight * k;
        ctx.drawImage(bi, (w - dw) / 2, (h - dh) / 2, dw, dh);
      }
    }
  }
  ctx.translate(pad - b.x, pad - b.y);
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
      ctx.beginPath();
      if (st.shape === "ellipse") ctx.ellipse(ln.w / 2, ln.h / 2, ln.w / 2, ln.h / 2, 0, 0, Math.PI * 2);
      else ctx.roundRect(0, 0, ln.w, ln.h, radiusFor(st.shape, ln.h));
      if (st.fill !== "none") {
        ctx.fillStyle = st.fill;
        ctx.fill();
      }
      if (st.stroke !== "none") {
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
  // tanda +/- untuk cabang terlipat
  for (const id of lay.order) {
    const ln = lay.nodes[id];
    if (!ln.badge || !ln.hasHidden) continue;
    const color = styleFor(sheet, sheet.nodes[id], ln.depth).branch;
    ctx.beginPath();
    ctx.arc(ln.badge.x, ln.badge.y, 8.5, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ln.badge.x - 4, ln.badge.y);
    ctx.lineTo(ln.badge.x + 4, ln.badge.y);
    ctx.moveTo(ln.badge.x, ln.badge.y - 4);
    ctx.lineTo(ln.badge.x, ln.badge.y + 4);
    ctx.stroke();
  }
  return new Promise((res, rej) => cv.toBlob((bl) => (bl ? res(bl) : rej(new Error("Gagal membuat PNG"))), "image/png"));
}

// ---------- SVG (gambar disematkan; font mengikuti nama keluarga font) ----------
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function sheetToSvg(sheet: Sheet): Promise<string> {
  const lay = computeLayout(sheet);
  const pad = 40;
  const b = lay.bounds;
  const w = Math.ceil(b.w + pad * 2),
    h = Math.ceil(b.h + pad * 2);
  const P: string[] = [];
  P.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`, `<rect width="${w}" height="${h}" fill="${sheet.bg.color}"/>`);
  if (sheet.bg.imageId && sheet.bg.fit !== "tile") {
    const u = await fileDataUrl(sheet.bg.imageId);
    if (u) P.push(`<image href="${u}" width="${w}" height="${h}" preserveAspectRatio="${sheet.bg.fit === "cover" ? "xMidYMid slice" : "xMidYMid meet"}"/>`);
  }
  P.push(`<g transform="translate(${pad - b.x},${pad - b.y})">`);
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
    if (st.shape === "line") P.push(`<line x1="0" y1="${ln.h}" x2="${ln.w}" y2="${ln.h}" stroke="${st.stroke}" stroke-width="${st.strokeWidth}" stroke-linecap="round"/>`);
    else if (st.shape === "ellipse") P.push(`<ellipse cx="${ln.w / 2}" cy="${ln.h / 2}" rx="${ln.w / 2}" ry="${ln.h / 2}" fill="${st.fill}" stroke="${st.stroke}" stroke-width="${st.strokeWidth}"/>`);
    else if (st.shape !== "none") P.push(`<rect width="${ln.w}" height="${ln.h}" rx="${radiusFor(st.shape, ln.h)}" fill="${st.fill}" stroke="${st.stroke}" stroke-width="${st.strokeWidth}"/>`);
    if (ln.img) {
      const u = await fileDataUrl(ln.img.fileId);
      if (u) P.push(`<image href="${u}" x="${ln.img.x}" y="${ln.img.y}" width="${ln.img.w}" height="${ln.img.h}" preserveAspectRatio="xMidYMid slice"/>`);
    }
    const fam = familyCss(n.font ?? sheet.font).replace(/"/g, "'");
    const weight = /^(\d+)\s/.exec(ln.font.replace(/^italic\s+/, ""))?.[1] ?? "400";
    ln.lines.forEach((l, i) =>
      P.push(
        `<text x="${ln.w / 2}" y="${ln.textTop + ln.lineH * (i + 0.5)}" text-anchor="middle" dominant-baseline="central" direction="${ln.rtl ? "rtl" : "ltr"}" fill="${st.text}" font-family="${fam}" font-size="${ln.fontSize}" font-weight="${weight}"${n.italic ? ' font-style="italic"' : ""}>${esc(l)}</text>`
      )
    );
    P.push(`</g>`);
  }
  P.push(`</g></svg>`);
  void fontById;
  void blobToDataUrl;
  void getFile;
  void guessMime;
  return P.join("");
}
