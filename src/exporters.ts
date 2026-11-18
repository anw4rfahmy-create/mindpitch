import { FONT_FAMILY } from "./measure";
import { computeLayout, edgePath } from "./layout";
import { Nodes, newDoc, uid, addChild } from "./model";
import { styleFor } from "./nodeStyle";
import { MapDoc, defaultPitch } from "./types";

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

// ---------- JSON ----------
export function toJSON(doc: MapDoc): string {
  return JSON.stringify({ app: "mindpitch", version: 1, doc }, null, 2);
}

export function fromJSON(text: string): MapDoc | null {
  try {
    const raw = JSON.parse(text);
    const d = raw?.doc ?? raw;
    if (!d || typeof d !== "object" || !d.nodes || !d.rootId || !d.nodes[d.rootId]) return null;
    const now = Date.now();
    const doc: MapDoc = {
      id: uid(),
      title: String(d.title || d.nodes[d.rootId].text || "Peta impor"),
      rootId: d.rootId,
      nodes: d.nodes,
      layout: d.layout === "right" || d.layout === "down" ? d.layout : "map",
      pitch: { ...defaultPitch(), ...(d.pitch || {}) },
      createdAt: now,
      updatedAt: now,
    };
    return doc;
  } catch {
    return null;
  }
}

// ---------- Markdown ----------
export function toMarkdown(doc: MapDoc): string {
  const lines: string[] = [];
  const root = doc.nodes[doc.rootId];
  lines.push(`# ${root.text.replace(/\n/g, " ")}`, "");
  if (root.note) lines.push(`> ${root.note.replace(/\n/g, " ")}`, "");
  const walk = (id: string, depth: number) => {
    const n = doc.nodes[id];
    lines.push(`${"  ".repeat(depth)}- ${n.text.replace(/\n/g, " ")}`);
    if (n.note) lines.push(`${"  ".repeat(depth + 1)}> ${n.note.replace(/\n/g, " ")}`);
    n.children.forEach((c) => walk(c, depth + 1));
  };
  root.children.forEach((c) => walk(c, 0));
  return lines.join("\n") + "\n";
}

export function fromMarkdown(text: string, fallbackTitle = "Peta impor"): MapDoc | null {
  const raw = text.replace(/\r/g, "").split("\n");
  type Item = { level: number; text: string };
  const items: Item[] = [];
  // deteksi unit indentasi
  const indents = raw
    .map((l) => /^(\s*)[-*+]\s|^(\s*)\d+[.)]\s/.exec(l))
    .filter(Boolean)
    .map((m) => (m![1] ?? m![2] ?? "").replace(/\t/g, "  ").length)
    .filter((n) => n > 0);
  const unit = indents.length ? Math.min(...indents) : 2;

  let headingLevel = 0;
  for (const line of raw) {
    if (!line.trim()) continue;
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      headingLevel = h[1].length;
      items.push({ level: headingLevel, text: h[2].trim() });
      continue;
    }
    const b = /^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (b) {
      const ind = b[1].replace(/\t/g, "  ").length;
      const base = headingLevel || 1;
      items.push({ level: base + 1 + Math.floor(ind / unit), text: b[2].trim() });
    } else if (!line.trim().startsWith(">")) {
      items.push({ level: (headingLevel || 1) + 1, text: line.trim() });
    }
  }
  if (!items.length) return null;

  const doc = newDoc(fallbackTitle);
  let nodes: Nodes = doc.nodes;
  let startIdx = 0;
  if (items[0].level === 1) {
    nodes = { ...nodes, [doc.rootId]: { ...nodes[doc.rootId], text: items[0].text } };
    doc.title = items[0].text;
    startIdx = 1;
  }
  const stack: { level: number; id: string }[] = [{ level: 1, id: doc.rootId }];
  for (let i = startIdx; i < items.length; i++) {
    const level = Math.max(2, items[i].level);
    while (stack.length > 1 && stack[stack.length - 1].level >= level) stack.pop();
    const parent = stack[stack.length - 1];
    const r = addChild(nodes, parent.id, items[i].text);
    nodes = r.nodes;
    stack.push({ level, id: r.id });
  }
  doc.nodes = nodes;
  return doc;
}

// ---------- SVG / PNG ----------
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function toSvg(doc: MapDoc): { svg: string; w: number; h: number } {
  const lay = computeLayout(doc.nodes, doc.rootId, doc.layout);
  const pad = 40;
  const b = lay.bounds;
  const w = Math.ceil(b.w + pad * 2);
  const h = Math.ceil(b.h + pad * 2);
  const ff = FONT_FAMILY.replace(/"/g, "'");
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<rect width="${w}" height="${h}" fill="#ffffff"/>`,
    `<g transform="translate(${pad - b.x},${pad - b.y})">`
  );
  for (const id of lay.order) {
    const c = lay.nodes[id];
    if (!c.parentId) continue;
    const st = styleFor(doc.nodes, doc.rootId, id, c.depth);
    parts.push(
      `<path d="${edgePath(lay.nodes[c.parentId], c)}" fill="none" stroke="${st.branch}" stroke-width="${
        c.depth === 1 ? 3 : 2
      }" stroke-linecap="round" opacity="0.85"/>`
    );
  }
  for (const id of lay.order) {
    const ln = lay.nodes[id];
    const st = styleFor(doc.nodes, doc.rootId, id, ln.depth);
    parts.push(`<g transform="translate(${ln.x},${ln.y})">`);
    if (st.shape === "line") {
      parts.push(
        `<line x1="0" y1="${ln.h}" x2="${ln.w}" y2="${ln.h}" stroke="${st.stroke}" stroke-width="${st.strokeWidth}"/>`
      );
    } else {
      parts.push(
        `<rect width="${ln.w}" height="${ln.h}" rx="${st.radius(ln.h)}" fill="${st.fill}" stroke="${st.stroke}" stroke-width="${st.strokeWidth}"/>`
      );
    }
    const y0 = (ln.h - ln.lines.length * ln.lineH) / 2;
    const weight = ln.depth === 0 ? 700 : ln.depth === 1 ? 600 : 400;
    ln.lines.forEach((l, i) => {
      parts.push(
        `<text x="${ln.w / 2}" y="${y0 + ln.lineH * (i + 0.5)}" text-anchor="middle" dominant-baseline="central" fill="${
          st.text
        }" font-family="${ff}" font-size="${ln.fontSize}" font-weight="${weight}">${esc(l)}</text>`
      );
    });
    parts.push(`</g>`);
  }
  parts.push(`</g></svg>`);
  return { svg: parts.join(""), w, h };
}

export async function svgToPng(svg: string, w: number, h: number, scale = 2): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("Gagal memuat SVG"));
      img.src = url;
    });
    const maxSide = 8192;
    const s = Math.min(scale, maxSide / Math.max(w, h));
    const cv = document.createElement("canvas");
    cv.width = Math.round(w * s);
    cv.height = Math.round(h * s);
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    return await new Promise<Blob>((res, rej) =>
      cv.toBlob((b) => (b ? res(b) : rej(new Error("Gagal membuat PNG"))), "image/png")
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
