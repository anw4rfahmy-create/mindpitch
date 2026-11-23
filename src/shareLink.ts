// Impor dari tautan (#import=...) — dipakai oleh konektor MCP Map It agar Claude dapat membuat berkas.
import { inflateSync, strFromU8 } from "fflate";
import { fromMarkdown } from "./exporters";
import { STRUCTURES } from "./FormatPanel";
import { newTableSheet, newWorkbook } from "./model";
import { tableFromGrid } from "./table";
import { Sheet, StructureId, Workbook } from "./types";

type SheetSpec =
  | { type: "map"; title?: string; outline: string; structure?: string }
  | { type: "table"; title?: string; rows: string[][]; header?: boolean; rtl?: boolean };
export interface ShareSpec {
  v: 1;
  title?: string;
  sheets: SheetSpec[];
}

const clip = (s: unknown, n: number) => String(s ?? "").slice(0, n);

export function buildFromSpec(spec: ShareSpec): Workbook | null {
  if (!spec || !Array.isArray(spec.sheets) || !spec.sheets.length) return null;
  const title = clip(spec.title, 120) || "Berkas dari Claude";
  const wb = newWorkbook(title);
  const sheets: Sheet[] = [];
  for (const sp of spec.sheets.slice(0, 30)) {
    const t = clip(sp.title, 120);
    if (sp.type === "table") {
      const rows = (Array.isArray(sp.rows) ? sp.rows : []).slice(0, 200).map((r) => (Array.isArray(r) ? r : [r]).slice(0, 40).map((c) => clip(c, 2000)));
      if (!rows.length) continue;
      const s = newTableSheet(t || `Tabel ${sheets.length + 1}`, "blank");
      s.table = tableFromGrid(rows);
      if (sp.header === false) s.table.headRows = 0;
      if (typeof sp.rtl === "boolean") s.table.rtl = sp.rtl;
      sheets.push(s);
    } else if (sp.type === "map") {
      const m = fromMarkdown(clip(sp.outline, 300000), t || title);
      const s = m?.sheets[0];
      if (!s) continue;
      if (t) s.title = t;
      if (sp.structure && STRUCTURES.some((x) => x.id === sp.structure)) s.structure = sp.structure as StructureId;
      sheets.push(s);
    }
  }
  if (!sheets.length) return null;
  wb.sheets = sheets;
  wb.activeId = sheets[0].id;
  return wb;
}

/** Baca `#import=<base64url(deflate-raw(JSON))>` dari alamat; kembalikan berkas atau null. */
export function readShareHash(hash: string): Workbook | null {
  const m = /^#import=([A-Za-z0-9_-]+)$/.exec(hash);
  if (!m) return null;
  try {
    const b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const spec = JSON.parse(strFromU8(inflateSync(bytes, { size: 4_000_000 } as any)));
    return buildFromSpec(spec);
  } catch {
    return null;
  }
}
