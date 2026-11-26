import { getFile, kindOf } from "./files";
import type { PdfPage } from "./exportRender";
import type { Attachment, Sheet } from "./types";

// Peramban lama belum punya Promise.withResolvers (dibutuhkan pdf.js)
const P = Promise as unknown as { withResolvers?: () => unknown };
if (!P.withResolvers) {
  P.withResolvers = function <T>() {
    let resolve!: (v: T) => void, reject!: (e: unknown) => void;
    const promise = new Promise<T>((a, b) => ((resolve = a), (reject = b)));
    return { promise, resolve, reject };
  };
}

export interface AttItem {
  sheet: string;
  label: string;
  att: Attachment;
}

const firstLine = (s: string) => (s ?? "").split("\n")[0].trim().slice(0, 60);

/** Semua lampiran (topik peta & sel tabel) pada lembar-lembar yang diekspor. */
export function collectAttachments(sheets: Sheet[]): AttItem[] {
  const out: AttItem[] = [];
  for (const s of sheets) {
    if (s.table) {
      const t = s.table;
      const keys = Object.keys(t.style).filter((k) => t.style[k].att?.length);
      keys.sort((a, b) => {
        const [ar, ac] = a.split(",").map(Number),
          [br, bc] = b.split(",").map(Number);
        return ar - br || ac - bc;
      });
      for (const k of keys) {
        const [r, c] = k.split(",").map(Number);
        const txt = firstLine(t.cells[r]?.[c] ?? "");
        for (const att of t.style[k].att!) out.push({ sheet: s.title, label: `Baris ${r + 1}, kolom ${c + 1}${txt ? " — " + txt : ""}`, att });
      }
    } else {
      for (const id in s.nodes) {
        const n = s.nodes[id];
        for (const att of n.attachments ?? []) out.push({ sheet: s.title, label: firstLine(n.text) || "Topik", att });
      }
    }
  }
  return out;
}

const fmtSize = (n: number) => (n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");

function toJpeg(cv: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((res, rej) =>
    cv.toBlob(async (b) => (b ? res(new Uint8Array(await b.arrayBuffer())) : rej(new Error("Gagal membuat halaman lampiran"))), "image/jpeg", 0.88)
  );
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (ctx.measureText(t).width > maxW && cur) (lines.push(cur), (cur = w));
    else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Halaman lampiran untuk PDF: gambar & PDF disematkan (satu halaman per gambar/halaman PDF), jenis lain dicantumkan. */
export async function attachmentPages(sheets: Sheet[], ptW: number, ptH: number): Promise<PdfPage[]> {
  const items = collectAttachments(sheets);
  const S = 2;
  const W = Math.round(ptW * S),
    H = Math.round(ptH * S);
  const M = 36 * S;
  const pages: PdfPage[] = [];

  const newPage = (it: AttItem, no: number, sub?: string) => {
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#4f46e5";
    ctx.fillRect(0, 0, W, 6 * S);
    ctx.textBaseline = "top";
    ctx.fillStyle = "#0f172a";
    ctx.font = `700 ${15 * S}px system-ui, sans-serif`;
    ctx.fillText(`Lampiran ${no}`, M, 22 * S);
    ctx.font = `400 ${10.5 * S}px system-ui, sans-serif`;
    ctx.fillStyle = "#475569";
    const head = `${it.sheet} › ${it.label}`;
    const hl = wrap(ctx, head, W - M * 2).slice(0, 2);
    hl.forEach((l, i) => ctx.fillText(l, M, (44 + i * 15) * S));
    ctx.fillStyle = "#64748b";
    ctx.font = `400 ${9.5 * S}px system-ui, sans-serif`;
    ctx.fillText(`${it.att.name} · ${fmtSize(it.att.size)}${sub ? " · " + sub : ""}`, M, (44 + hl.length * 15 + 2) * S);
    const top = (44 + hl.length * 15 + 24) * S;
    return { cv, ctx, top };
  };
  const push = async (cv: HTMLCanvasElement) => pages.push({ jpeg: await toJpeg(cv), pxW: W, pxH: H, ptW, ptH });
  const fit = (ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, top: number) => {
    const aw = W - M * 2,
      ah = H - top - M;
    const k = Math.min(aw / sw, ah / sh, 3);
    const dw = sw * k,
      dh = sh * k;
    ctx.drawImage(src, M + (aw - dw) / 2, top, dw, dh);
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = S;
    ctx.strokeRect(M + (aw - dw) / 2, top, dw, dh);
  };

  let no = 0;
  for (const it of items) {
    no++;
    const f = await getFile(it.att.id);
    const kind = kindOf(it.att.mime, it.att.name);
    try {
      if (f && kind === "image") {
        const bmp = await createImageBitmap(f.blob);
        const { cv, ctx, top } = newPage(it, no);
        fit(ctx, bmp, bmp.width, bmp.height, top);
        await push(cv);
        continue;
      }
      if (f && kind === "pdf") {
        const pdfjs = await import("pdfjs-dist");
        const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.blob.arrayBuffer()) }).promise;
        const n = Math.min(doc.numPages, 40);
        for (let i = 1; i <= n; i++) {
          const pg = await doc.getPage(i);
          const v0 = pg.getViewport({ scale: 1 });
          const { cv, ctx, top } = newPage(it, no, `hlm ${i}/${doc.numPages}`);
          const k = Math.min((W - M * 2) / v0.width, (H - top - M) / v0.height) * 1.5;
          const vp = pg.getViewport({ scale: k });
          const tmp = document.createElement("canvas");
          tmp.width = Math.floor(vp.width);
          tmp.height = Math.floor(vp.height);
          const tctx = tmp.getContext("2d")!;
          tctx.fillStyle = "#fff";
          tctx.fillRect(0, 0, tmp.width, tmp.height);
          await pg.render({ canvasContext: tctx, viewport: vp }).promise;
          fit(ctx, tmp, tmp.width, tmp.height, top);
          await push(cv);
        }
        doc.destroy?.();
        continue;
      }
    } catch {
      /* jatuh ke kartu keterangan di bawah */
    }
    const { cv, ctx, top } = newPage(it, no);
    ctx.fillStyle = "#f1f5f9";
    ctx.fillRect(M, top, W - M * 2, 120 * S);
    ctx.fillStyle = "#334155";
    ctx.font = `600 ${12 * S}px system-ui, sans-serif`;
    ctx.fillText("Berkas ini tidak dapat ditampilkan di dalam PDF.", M + 16 * S, top + 24 * S);
    ctx.font = `400 ${10.5 * S}px system-ui, sans-serif`;
    ctx.fillStyle = "#64748b";
    ctx.fillText("Buka berkasnya langsung di aplikasi Map It, atau ekspor sebagai berkas Map It.", M + 16 * S, top + 52 * S);
    await push(cv);
  }
  return pages;
}
