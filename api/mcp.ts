// Konektor MCP (Streamable HTTP, tanpa status & tanpa login) untuk Map It.
// Claude memanggil tool → server memadatkan spesifikasi ke sebuah tautan → pengguna membuka tautan itu
// dan aplikasi membuat berkasnya di perangkat pengguna. Server tidak menyimpan apa pun.
import { deflateRawSync } from "node:zlib";
import type { IncomingMessage, ServerResponse } from "node:http";

const APP_URL = (process.env.APP_URL || "https://mapit-anwar.vercel.app").replace(/\/$/, "");
const VERSION = "1.0.0";
const SUPPORTED = ["2025-06-18", "2025-03-26", "2024-11-05"];

const STRUCTURES = ["mind-both", "mind-right", "mind-left", "logic-right", "logic-left", "logic-both", "brace-right", "brace-left", "org-down", "org-up", "tree-right", "tree-left", "timeline", "fishbone"];

const OUTLINE_HELP =
  'Format outline = Markdown: baris pertama opsional "# Topik pusat", lalu daftar bertingkat dengan "- " dan indentasi 2 spasi per tingkat. Contoh:\n# Fi\'il\n- Madhi\n  - Mujarrad\n  - Mazid\n- Mudhari\'\n- Amr';
const TABLE_HELP = "rows = daftar baris, tiap baris daftar teks sel. Baris pertama dipakai sebagai header. Teks Arab (dengan harakat) didukung dan arah tabel kanan-ke-kiri diatur otomatis.";

const mapSheet = {
  type: "object",
  properties: {
    type: { const: "map" },
    title: { type: "string", description: "Nama lembar" },
    outline: { type: "string", description: OUTLINE_HELP },
    structure: { type: "string", enum: STRUCTURES, description: "Struktur peta (default mind-both)" },
  },
  required: ["type", "outline"],
};
const tableSheet = {
  type: "object",
  properties: {
    type: { const: "table" },
    title: { type: "string", description: "Nama lembar" },
    rows: { type: "array", items: { type: "array", items: { type: "string" } }, description: TABLE_HELP },
    header: { type: "boolean", description: "Baris pertama adalah header (default true)" },
    rtl: { type: "boolean", description: "Paksa arah kanan-ke-kiri (default: otomatis dari isi)" },
  },
  required: ["type", "rows"],
};

const ANN = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const TOOLS = [
  {
    name: "create_mindmap",
    title: "Buat peta pikiran",
    description:
      "Membuat peta pikiran di Map It dari sebuah outline dan mengembalikan tautan untuk membukanya. Tidak menyimpan apa pun di server; berkas dibuat di perangkat pengguna saat tautan dibuka. " + OUTLINE_HELP,
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Judul berkas" },
        outline: { type: "string", description: OUTLINE_HELP },
        structure: { type: "string", enum: STRUCTURES, description: "Struktur peta (default mind-both)" },
      },
      required: ["title", "outline"],
    },
    annotations: ANN,
  },
  {
    name: "create_table",
    title: "Buat tabel",
    description: "Membuat lembar tabel di Map It (mis. tabel tashrif, perbandingan, jadwal) dan mengembalikan tautan untuk membukanya. " + TABLE_HELP,
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Judul berkas" },
        rows: { type: "array", items: { type: "array", items: { type: "string" } }, description: TABLE_HELP },
        header: { type: "boolean", description: "Baris pertama adalah header (default true)" },
        rtl: { type: "boolean", description: "Paksa arah kanan-ke-kiri (default: otomatis dari isi)" },
      },
      required: ["title", "rows"],
    },
    annotations: ANN,
  },
  {
    name: "create_workbook",
    title: "Buat berkas berisi beberapa lembar",
    description: "Membuat satu berkas Map It berisi beberapa lembar, campuran peta pikiran dan tabel (mis. peta pembagian fi'il + tabel tashrifnya). Mengembalikan tautan untuk membukanya.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Judul berkas" },
        sheets: { type: "array", minItems: 1, maxItems: 30, items: { oneOf: [mapSheet, tableSheet] } },
      },
      required: ["title", "sheets"],
    },
    annotations: ANN,
  },
];

const INSTRUCTIONS =
  "Map It adalah aplikasi peta pikiran + tabel + presentasi. Gunakan create_mindmap untuk peta, create_table untuk tabel (termasuk tabel tashrif berbahasa Arab), dan create_workbook untuk gabungan beberapa lembar. Tool mengembalikan tautan; sampaikan tautan itu kepada pengguna agar dibuka di browser. Isi teks sebaiknya ringkas dan dalam bahasa yang diminta pengguna.";

// ---------------------------------------------------------------- tool handlers
type Spec = { v: 1; title: string; sheets: any[] };
const isStr = (x: unknown): x is string => typeof x === "string";

function asSheet(s: any, i: number): any {
  if (!s || typeof s !== "object") throw new Error(`sheets[${i}] tidak valid`);
  if (s.type === "map") {
    if (!isStr(s.outline) || !s.outline.trim()) throw new Error(`sheets[${i}].outline wajib berupa teks`);
    if (s.structure !== undefined && !STRUCTURES.includes(s.structure)) throw new Error(`sheets[${i}].structure tidak dikenal`);
    return { type: "map", title: isStr(s.title) ? s.title : undefined, outline: s.outline, structure: s.structure };
  }
  if (s.type === "table") {
    if (!Array.isArray(s.rows) || !s.rows.length || !s.rows.every((r: unknown) => Array.isArray(r))) throw new Error(`sheets[${i}].rows wajib berupa daftar baris`);
    return {
      type: "table",
      title: isStr(s.title) ? s.title : undefined,
      rows: s.rows.map((r: unknown[]) => r.map((c) => (c == null ? "" : String(c)))),
      header: typeof s.header === "boolean" ? s.header : undefined,
      rtl: typeof s.rtl === "boolean" ? s.rtl : undefined,
    };
  }
  throw new Error(`sheets[${i}].type harus "map" atau "table"`);
}

function makeLink(spec: Spec): string {
  const json = JSON.stringify(spec);
  const b64 = deflateRawSync(Buffer.from(json, "utf8"), { level: 9 }).toString("base64url");
  return `${APP_URL}/#import=${b64}`;
}

function callTool(name: string, a: any): string {
  if (!a || typeof a !== "object") throw new Error("argumen wajib berupa objek");
  const title = isStr(a.title) && a.title.trim() ? a.title.trim() : "Berkas dari Claude";
  let sheets: any[];
  if (name === "create_mindmap") sheets = [asSheet({ type: "map", title, outline: a.outline, structure: a.structure }, 0)];
  else if (name === "create_table") sheets = [asSheet({ type: "table", title, rows: a.rows, header: a.header, rtl: a.rtl }, 0)];
  else if (name === "create_workbook") {
    if (!Array.isArray(a.sheets) || !a.sheets.length) throw new Error("sheets wajib berisi minimal satu lembar");
    sheets = a.sheets.slice(0, 30).map(asSheet);
  } else throw new Error(`Tool tidak dikenal: ${name}`);
  const url = makeLink({ v: 1, title, sheets });
  const kinds = sheets.map((s) => (s.type === "map" ? "peta" : "tabel")).join(", ");
  const warn = url.length > 12000 ? "\n\nCatatan: tautan sangat panjang; sebagian aplikasi chat bisa memotongnya. Pertimbangkan membagi menjadi beberapa berkas yang lebih kecil." : "";
  return `Berkas "${title}" siap (${sheets.length} lembar: ${kinds}).\n\nBuka di Map It: ${url}\n\nTautan ini membuat berkas di perangkat pengguna saat dibuka (pengguna akan diminta konfirmasi). Tidak ada yang disimpan di server.${warn}`;
}

// ---------------------------------------------------------------- JSON-RPC
type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: any };
const ok = (id: any, result: unknown) => ({ jsonrpc: "2.0", id, result });
const err = (id: any, code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

export function handleRpc(m: Rpc): unknown | null {
  if (!m || m.jsonrpc !== "2.0" || typeof m.method !== "string") return err(m?.id, -32600, "Invalid Request");
  const isNote = m.id === undefined;
  switch (m.method) {
    case "initialize": {
      const want = m.params?.protocolVersion;
      return ok(m.id, {
        protocolVersion: SUPPORTED.includes(want) ? want : SUPPORTED[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "mapit", title: "Map It", version: VERSION },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return ok(m.id, {});
    case "tools/list":
      return ok(m.id, { tools: TOOLS });
    case "tools/call": {
      try {
        const text = callTool(m.params?.name, m.params?.arguments);
        return ok(m.id, { content: [{ type: "text", text }], isError: false });
      } catch (e) {
        return ok(m.id, { content: [{ type: "text", text: `Gagal: ${(e as Error).message}` }], isError: true });
      }
    }
    default:
      return isNote ? null : err(m.id, -32601, `Method not found: ${m.method}`);
  }
}

async function readBody(req: IncomingMessage & { body?: unknown }): Promise<unknown> {
  if (req.body !== undefined && req.body !== null && req.body !== "") return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 1_000_000) throw new Error("payload terlalu besar");
    chunks.push(c as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export default async function handler(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type, accept, mcp-protocol-version, mcp-session-id, authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  const send = (code: number, body?: unknown) => {
    res.statusCode = code;
    if (body === undefined) return res.end();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(body));
  };
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return send(405, err(null, -32000, "Gunakan POST (Streamable HTTP, tanpa sesi)."));
  }
  let msg: unknown;
  try {
    msg = await readBody(req);
  } catch {
    return send(400, err(null, -32700, "Parse error"));
  }
  if (Array.isArray(msg)) {
    const out = msg.map((m) => handleRpc(m as Rpc)).filter((x) => x !== null);
    return out.length ? send(200, out) : send(202);
  }
  const r = handleRpc(msg as Rpc);
  return r === null ? send(202) : send(200, r);
}
