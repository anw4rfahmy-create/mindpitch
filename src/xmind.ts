// Impor/ekspor berkas .xmind (zip: content.json atau content.xml lama).
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { newSheet, uid } from "./model";
import { MNode, Sheet, StructureId, Workbook } from "./types";

const TO_XMIND: Record<StructureId, string> = {
  "mind-both": "org.xmind.ui.map.clockwise",
  "mind-right": "org.xmind.ui.map.unbalanced",
  "mind-left": "org.xmind.ui.map.unbalanced",
  "logic-right": "org.xmind.ui.logic.right",
  "logic-left": "org.xmind.ui.logic.left",
  "logic-both": "org.xmind.ui.logic.right",
  "brace-right": "org.xmind.ui.brace.right",
  "brace-left": "org.xmind.ui.brace.left",
  "org-down": "org.xmind.ui.org-chart.down",
  "org-up": "org.xmind.ui.org-chart.up",
  "tree-right": "org.xmind.ui.tree.right",
  "tree-left": "org.xmind.ui.tree.left",
  timeline: "org.xmind.ui.timeline.horizontal",
  fishbone: "org.xmind.ui.fishbone.leftHeaded",
};

function fromXmindStructure(c?: string): StructureId {
  if (!c) return "mind-both";
  if (c.includes("clockwise") || c.includes("map.anticlockwise")) return "mind-both";
  if (c.includes("unbalanced")) return "mind-right";
  if (c.includes("logic.left")) return "logic-left";
  if (c.includes("logic")) return "logic-right";
  if (c.includes("brace.left")) return "brace-left";
  if (c.includes("brace")) return "brace-right";
  if (c.includes("org-chart.up")) return "org-up";
  if (c.includes("org-chart") || c.includes("matrix")) return "org-down";
  if (c.includes("tree.left")) return "tree-left";
  if (c.includes("tree")) return "tree-right";
  if (c.includes("fishbone")) return "fishbone";
  if (c.includes("timeline")) return "timeline";
  return "mind-both";
}

// ---------------------------------------------------------------- ekspor
function topicJson(sheet: Sheet, id: string, root = false): any {
  const n = sheet.nodes[id];
  const t: any = { id, class: "topic", title: n.text };
  if (root) t.structureClass = TO_XMIND[sheet.structure] ?? "org.xmind.ui.map.clockwise";
  if (n.note) t.notes = { plain: { content: n.note } };
  if (n.collapsed && n.children.length) t.branch = "folded";
  const kids = n.children.filter((c) => sheet.nodes[c]);
  if (kids.length) t.children = { attached: kids.map((c) => topicJson(sheet, c)) };
  return t;
}

export function toXmind(wb: Workbook): Blob {
  const content = (wb.sheets.some((s) => !s.table) ? wb.sheets.filter((s) => !s.table) : wb.sheets).map((s) => ({
    id: s.id,
    class: "sheet",
    title: s.title,
    rootTopic: topicJson(s, s.rootId, true),
    topicPositioning: "fixed",
  }));
  const files = {
    "content.json": strToU8(JSON.stringify(content)),
    "metadata.json": strToU8(JSON.stringify({ creator: { name: "Map It", version: "2.0" } })),
    "manifest.json": strToU8(JSON.stringify({ "file-entries": { "content.json": {}, "metadata.json": {} } })),
  };
  return new Blob([zipSync(files, { level: 6 }) as BlobPart], { type: "application/vnd.xmind.workbook" });
}

// ---------------------------------------------------------------- impor
function addTopic(sheet: Sheet, parent: string | null, t: any, isRoot: boolean): string {
  const id = isRoot ? sheet.rootId : uid() + Math.random().toString(36).slice(2, 5);
  const node: MNode = {
    id,
    parentId: parent,
    text: String(t.title ?? "").trim() || (isRoot ? "Topik utama" : "(tanpa judul)"),
    children: [],
  };
  const note = t.notes?.plain?.content ?? (t.notes?.realHtml?.content ? String(t.notes.realHtml.content).replace(/<[^>]+>/g, "") : undefined);
  if (note) node.note = String(note);
  if (t.branch === "folded") node.collapsed = true;
  sheet.nodes[id] = node;
  const kids: any[] = t.children?.attached ?? [];
  for (const k of kids) node.children.push(addTopic(sheet, id, k, false));
  if (!node.children.length) delete node.collapsed;
  return id;
}

function sheetFromJson(s: any): Sheet {
  const root = s.rootTopic ?? {};
  const sh = newSheet(String(s.title || root.title || "Lembar"), "x", fromXmindStructure(root.structureClass));
  sh.nodes = {};
  addTopic(sh, null, root, true);
  return sh;
}

function xmlTopic(sheet: Sheet, parent: string | null, el: Element, isRoot: boolean): string {
  const id = isRoot ? sheet.rootId : uid() + Math.random().toString(36).slice(2, 5);
  const direct = (name: string, within: Element) => [...within.children].filter((c) => c.localName === name);
  const title = direct("title", el)[0]?.textContent?.trim() || (isRoot ? "Topik utama" : "(tanpa judul)");
  const node: MNode = { id, parentId: parent, text: title, children: [] };
  const note = direct("notes", el)[0]?.querySelector("plain")?.textContent?.trim();
  if (note) node.note = note;
  if (el.getAttribute("branch") === "folded") node.collapsed = true;
  sheet.nodes[id] = node;
  const topics = direct("children", el)[0] ? direct("topics", direct("children", el)[0]).filter((t) => (t.getAttribute("type") || "attached") === "attached") : [];
  for (const group of topics) for (const t of direct("topic", group)) node.children.push(xmlTopic(sheet, id, t, false));
  if (!node.children.length) delete node.collapsed;
  return id;
}

export async function fromXmind(file: File): Promise<Workbook | null> {
  const z = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const sheets: Sheet[] = [];
  if (z["content.json"]) {
    const data = JSON.parse(strFromU8(z["content.json"]));
    for (const s of Array.isArray(data) ? data : [data]) if (s?.rootTopic) sheets.push(sheetFromJson(s));
  } else if (z["content.xml"]) {
    const doc = new DOMParser().parseFromString(strFromU8(z["content.xml"]), "application/xml");
    for (const sEl of [...doc.getElementsByTagName("sheet")]) {
      const root = [...sEl.children].find((c) => c.localName === "topic");
      if (!root) continue;
      const title = [...sEl.children].find((c) => c.localName === "title")?.textContent?.trim();
      const sh = newSheet(title || "Lembar", "x", fromXmindStructure(root.getAttribute("structure-class") || undefined));
      sh.nodes = {};
      xmlTopic(sh, null, root, true);
      sheets.push(sh);
    }
  }
  if (!sheets.length) return null;
  const now = Date.now();
  const title = file.name.replace(/\.xmind$/i, "") || sheets[0].title;
  return { id: uid(), title, sheets, activeId: sheets[0].id, createdAt: now, updatedAt: now };
}
