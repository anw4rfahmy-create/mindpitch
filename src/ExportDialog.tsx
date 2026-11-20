import { useEffect, useMemo, useRef, useState } from "react";
import { computeLayout } from "./layout";
import { FRAMES, PAPERS, RATIOS, ExportOpts, defaultExportOpts, framePreviewSvg, pageSize, renderBlob, renderPage, renderPdf, renderSvg } from "./exportRender";
import { download, safeName, sheetToMarkdown, toMindpitch } from "./exporters";
import { toXmind } from "./xmind";
import { Sheet, Workbook } from "./types";

type Fmt = "png" | "pdf" | "svg" | "xmind" | "mindpitch" | "md";

const FORMATS: { id: Fmt; label: string; sub: string }[] = [
  { id: "pdf", label: "PDF", sub: "A4, B5, dll." },
  { id: "png", label: "Gambar PNG", sub: "rasio 3:4, 16:9, dll." },
  { id: "svg", label: "Gambar SVG", sub: "vektor" },
  { id: "xmind", label: "XMind", sub: ".xmind" },
  { id: "mindpitch", label: "MindPitch", sub: "semua lembar + lampiran" },
  { id: "md", label: "Markdown", sub: "lembar ini" },
];

const FRAME_COLORS = ["#334155", "#e5534b", "#e8b931", "#3fae7f", "#4c8bf5", "#9b6bdf", "#0f172a", "#b45309"];

interface Props {
  wb: Workbook;
  sheet: Sheet;
  onClose(): void;
  onDone(msg: string): void;
}

export default function ExportDialog({ wb, sheet, onClose, onDone }: Props) {
  const [fmt, setFmt] = useState<Fmt>("pdf");
  const [o, setO] = useState<ExportOpts>({ ...defaultExportOpts(), format: "pdf" });
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string>();
  const seq = useRef(0);
  const visual = fmt === "png" || fmt === "pdf" || fmt === "svg";
  const set = (p: Partial<ExportOpts>) => setO((x) => ({ ...x, ...p }));
  const opts: ExportOpts = { ...o, format: visual ? (fmt as "png" | "pdf" | "svg") : "png" };
  const lay = useMemo(() => computeLayout(sheet), [sheet]);
  const size = pageSize(sheet, lay, opts);

  useEffect(() => {
    if (!visual) return;
    const my = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const ps = pageSize(sheet, lay, { ...opts, format: fmt === "svg" ? "png" : opts.format }, 560);
        const cv = await renderPage(sheet, { ...opts, format: "png" }, ps, o.title ? sheet.title : undefined);
        if (my === seq.current) setPreview(cv.toDataURL("image/jpeg", 0.85));
      } catch {
        /* abaikan */
      }
    }, 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fmt, o, sheet]);

  const run = async () => {
    setBusy(true);
    try {
      const base = safeName(wb.title + (fmt === "mindpitch" || fmt === "xmind" ? "" : "-" + sheet.title));
      if (fmt === "mindpitch") download(await toMindpitch(wb), `${safeName(wb.title)}.mindpitch`);
      else if (fmt === "xmind") download(toXmind(wb), `${safeName(wb.title)}.xmind`);
      else if (fmt === "md") download(new Blob([sheetToMarkdown(sheet)], { type: "text/markdown" }), `${base}.md`);
      else if (fmt === "svg") download(new Blob([await renderSvg(sheet, opts, o.title ? sheet.title : undefined)], { type: "image/svg+xml" }), `${base}.svg`);
      else if (fmt === "png") download((await renderBlob(sheet, opts, "image/png", o.title ? sheet.title : undefined)).blob, `${base}.png`);
      else {
        const list = o.scope === "all" ? wb.sheets : [sheet];
        download(await renderPdf(list, opts, wb.title), `${safeName(wb.title + (o.scope === "all" ? "" : "-" + sheet.title))}.pdf`);
      }
      onDone("Berhasil diekspor");
      onClose();
    } catch (e) {
      onDone((e as Error).message || "Gagal mengekspor");
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    try {
      const f = new File([await toMindpitch(wb)], `${safeName(wb.title)}.mindpitch`, { type: "application/zip" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare?.({ files: [f] })) await nav.share({ files: [f], title: wb.title });
      else onDone("Perangkat ini tidak mendukung menu Bagikan. Gunakan Ekspor lalu simpan ke akun awan Anda.");
    } catch {
      /* dibatalkan */
    }
  };

  return (
    <div className="modal-back" onPointerDown={onClose}>
      <div className="modal export-modal" onPointerDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <b>⬇ Ekspor</b>
          <div className="spacer" />
          <button className="btn icon small" onClick={onClose} aria-label="Tutup">
            ✕
          </button>
        </div>
        <div className="export-body">
          <div className="export-opts">
            <div className="fmt-grid">
              {FORMATS.map((f) => (
                <button key={f.id} className={fmt === f.id ? "on" : ""} onClick={() => setFmt(f.id)}>
                  <b>{f.label}</b>
                  <small>{f.sub}</small>
                </button>
              ))}
            </div>

            {fmt === "pdf" && (
              <>
                <div className="field">
                  <span>Ukuran kertas</span>
                  <div className="chips">
                    {PAPERS.map((p) => (
                      <button key={p.id} className={o.paper === p.id ? "on" : ""} onClick={() => set({ paper: p.id })}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <span>Orientasi</span>
                  <div className="seg">
                    {(
                      [
                        ["auto", "Otomatis"],
                        ["portrait", "Tegak"],
                        ["landscape", "Mendatar"],
                      ] as const
                    ).map(([v, l]) => (
                      <button key={v} className={o.orientation === v ? "on" : ""} onClick={() => set({ orientation: v })}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <span>Isi</span>
                  <div className="seg">
                    <button className={o.scope === "sheet" ? "on" : ""} onClick={() => set({ scope: "sheet" })}>
                      Lembar ini
                    </button>
                    <button className={o.scope === "all" ? "on" : ""} onClick={() => set({ scope: "all" })}>
                      Semua lembar ({wb.sheets.length} hlm)
                    </button>
                  </div>
                </div>
              </>
            )}
            {(fmt === "png" || fmt === "svg") && (
              <div className="field">
                <span>Ukuran / rasio</span>
                <div className="chips">
                  {RATIOS.map((r) => (
                    <button key={r.id} className={o.ratio === r.id ? "on" : ""} onClick={() => set({ ratio: r.id })}>
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {visual && (
              <>
                <div className="field">
                  <span>Bingkai</span>
                  <div className="frame-grid">
                    {FRAMES.map((f) => (
                      <button key={f.id} className={o.frame === f.id ? "on" : ""} onClick={() => set({ frame: f.id })} title={f.label}>
                        <span dangerouslySetInnerHTML={{ __html: framePreviewSvg(f.id, 54, 72, o.frameColor) }} />
                        <small>{f.label}</small>
                      </button>
                    ))}
                  </div>
                  {o.frame !== "none" && (
                    <div className="swatches">
                      {FRAME_COLORS.map((c) => (
                        <button key={c} className={"swatch" + (o.frameColor === c ? " on" : "")} style={{ background: c }} onClick={() => set({ frameColor: c })} />
                      ))}
                      <input type="color" value={o.frameColor} onChange={(e) => set({ frameColor: e.target.value })} />
                    </div>
                  )}
                </div>
                <label className="check">
                  <input type="checkbox" checked={o.title} onChange={(e) => set({ title: e.target.checked })} /> Tampilkan judul lembar di atas
                </label>
                {fmt === "png" && (
                  <label className="check">
                    <input type="checkbox" checked={o.transparent} onChange={(e) => set({ transparent: e.target.checked })} /> Latar transparan
                  </label>
                )}
                {fmt !== "svg" && (
                  <div className="field">
                    <span>Kualitas</span>
                    <div className="seg">
                      <button className={o.quality === 1 ? "on" : ""} onClick={() => set({ quality: 1 })}>
                        Normal
                      </button>
                      <button className={o.quality === 2 ? "on" : ""} onClick={() => set({ quality: 2 })}>
                        Tinggi
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {fmt === "xmind" && <p className="muted small">Berkas .xmind berisi semua lembar, struktur peta, dan catatan, bisa dibuka di XMind. Gaya warna, gambar, dan lampiran tidak ikut terbawa.</p>}
            {fmt === "mindpitch" && (
              <>
                <p className="muted small">Cadangan penuh semua lembar beserta gambar & lampiran. Simpan ke Google Drive/iCloud lewat Bagikan agar tersinkron di akun Anda.</p>
                <button className="btn block" onClick={share}>
                  ↗ Bagikan / simpan ke akun awan…
                </button>
              </>
            )}
            {fmt === "md" && <p className="muted small">Outline berindentasi (Markdown) dari lembar yang sedang dibuka.</p>}
          </div>

          <div className="export-preview">
            {visual ? (
              <>
                <div className="prev-frame">{preview ? <img src={preview} alt="Pratinjau" /> : <div className="muted small">Memuat pratinjau…</div>}</div>
                <div className="muted small center">
                  {fmt === "pdf" ? `${o.paper} · ` : ""}
                  {size.w}×{size.h} px
                </div>
              </>
            ) : (
              <div className="muted center pad">Pilih format lalu klik Ekspor.</div>
            )}
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>
            Batal
          </button>
          <button className="btn primary" disabled={busy} onClick={run}>
            {busy ? "Memproses…" : "⬇ Ekspor"}
          </button>
        </div>
      </div>
    </div>
  );
}
