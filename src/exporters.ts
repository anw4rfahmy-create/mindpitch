import { tableToMarkdown } from "./table";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { addChild, newSheet, normalizeWorkbook, uid, activeSheet } from "./model";
import { filesOfDoc, putFile } from "./files";
import { fromXmind } from "./xmind";
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
    if (name.endsWith(".xmind")) return await fromXmind(file);
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
  if (sheet.table) return tableToMarkdown(sheet);
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

