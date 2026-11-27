import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Attachment } from "./types";
import { MAX_FILE_BYTES, downloadStored, getFile, kindOf, urlOfAsync } from "./files";

const PdfView = lazy(() => import("./PdfView"));

interface Props {
  title: string;
  items: Attachment[];
  startId?: string;
  onAdd(files: File[]): void;
  onRemove(id: string): void;
  onClose(): void;
}

const ICON: Record<string, string> = { image: "🖼", pdf: "📕", ppt: "📊", doc: "📄", sheet: "📈", audio: "🎵", video: "🎬", other: "📎" };
const fmt = (n: number) => (n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");

export default function AttachmentViewer({ title, items, startId, onAdd, onRemove, onClose }: Props) {
  const [cur, setCur] = useState<string | undefined>(startId ?? items[0]?.id);
  const [url, setUrl] = useState<string>();
  const [pdfFail, setPdfFail] = useState(false);
  const att = items.find((a) => a.id === cur) ?? items[0];

  // pembatas daftar berkas ↔ pratinjau yang bisa digeser (disimpan)
  const body = useRef<HTMLDivElement>(null);
  const [listPx, setListPx] = useState<number | null>(() => {
    try {
      const v = Number(localStorage.getItem("mapit-attlist"));
      return v > 0 ? v : null;
    } catch {
      return null;
    }
  });
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const el = body.current!;
    const stacked = getComputedStyle(el).flexDirection === "column";
    const move = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const total = stacked ? r.height : r.width;
      const pos = stacked ? ev.clientY - r.top : ev.clientX - r.left;
      setListPx(Math.round(Math.min(total - 120, Math.max(stacked ? 56 : 120, pos))));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setListPx((v) => {
        try {
          if (v) localStorage.setItem("mapit-attlist", String(v));
        } catch {}
        return v;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  useEffect(() => {
    if (!items.find((a) => a.id === cur)) setCur(items[0]?.id);
  }, [items, cur]);

  useEffect(() => {
    setUrl(undefined);
    setPdfFail(false);
    if (att) urlOfAsync(att.id).then(setUrl);
  }, [att?.id]);

  const kind = att ? kindOf(att.mime, att.name) : "other";

  const download = async () => {
    if (!att) return;
    const f = await getFile(att.id);
    if (f) downloadStored({ blob: f.blob, name: att.name });
  };

  return (
    <div className="modal-back" onPointerDown={onClose}>
      <div className="modal attach-modal" onPointerDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <b>Lampiran — {title}</b>
          <div className="spacer" />
          <label className="btn small">
            ＋ Tambah berkas
            <input
              type="file"
              multiple
              hidden
              accept="image/*,.pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.txt,audio/*,video/*"
              onChange={(e) => {
                const fs = Array.from(e.target.files ?? []);
                e.target.value = "";
                const ok = fs.filter((f) => f.size <= MAX_FILE_BYTES);
                if (ok.length < fs.length) alert("Berkas di atas 60 MB dilewati.");
                if (ok.length) onAdd(ok);
              }}
            />
          </label>
          <button className="btn icon small" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="attach-body" ref={body} style={listPx ? ({ "--lp": listPx + "px" } as React.CSSProperties) : undefined}>
          <div className="attach-list">
            {items.length === 0 && <p className="muted small pad">Belum ada lampiran. Tambahkan gambar, PDF, PPT, atau berkas lain.</p>}
            {items.map((a) => (
              <div key={a.id} className={"attach-item" + (a.id === att?.id ? " on" : "")} onClick={() => setCur(a.id)}>
                <span>{ICON[kindOf(a.mime, a.name)]}</span>
                <div className="grow">
                  <div className="an">{a.name}</div>
                  <div className="muted small">{fmt(a.size)}</div>
                </div>
                <button
                  className="btn icon small"
                  title="Hapus"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(a.id);
                  }}
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
          <div className="attach-split" onPointerDown={startResize} onDoubleClick={() => (setListPx(null), localStorage.removeItem("mapit-attlist"))} title="Geser untuk mengatur ukuran (klik dua kali: kembali ke bawaan)" role="separator" />
          <div className="attach-preview">
            {!att && <div className="muted">Pilih lampiran untuk dilihat</div>}
            {att && !url && <div className="muted">Memuat…</div>}
            {att && url && kind === "image" && <img src={url} alt={att.name} />}
            {att && url && kind === "pdf" && !pdfFail && (
              <Suspense fallback={<div className="muted">Memuat…</div>}>
                <PdfView url={url} onFail={() => setPdfFail(true)} />
              </Suspense>
            )}
            {att && url && kind === "pdf" && pdfFail && (
              <div className="center-note">
                <div style={{ fontSize: 54 }}>{ICON.pdf}</div>
                <b>{att.name}</b>
                <p className="muted small">PDF tidak dapat ditampilkan di sini.</p>
                <button className="btn primary" onClick={download}>⬇ Unduh / Buka</button>
              </div>
            )}
            {att && url && kind === "video" && <video src={url} controls />}
            {att && url && kind === "audio" && <audio src={url} controls />}
            {att && url && !["image", "pdf", "video", "audio"].includes(kind) && (
              <div className="center-note">
                <div style={{ fontSize: 54 }}>{ICON[kind]}</div>
                <b>{att.name}</b>
                <p className="muted small">
                  {kind === "ppt" ? "Presentasi PowerPoint tidak bisa ditampilkan langsung di peramban." : "Berkas ini dibuka dengan aplikasi lain."}
                  <br />
                  Unduh lalu buka dengan aplikasinya.
                </p>
                <button className="btn primary" onClick={download}>
                  ⬇ Unduh / Buka
                </button>
              </div>
            )}
            {att && url && ["image"].includes(kind) && (
              <button className="btn small dl" onClick={download}>
                ⬇ Unduh
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
