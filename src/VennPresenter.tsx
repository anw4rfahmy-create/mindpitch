import { useEffect, useMemo, useState } from "react";
import { Sheet } from "./types";
import { ensureVennFonts, revealOrder, vennBlocks, vennSvg } from "./venn";

/** Presentasi Venn: lingkaran dan nama muncul dulu, lalu isi tiap area satu per satu. */
export default function VennPresenter({ sheet, onClose }: { sheet: Sheet; onClose(): void }) {
  const v = sheet.venn!;
  const order = useMemo(() => revealOrder(v), [v]);
  const [n, setN] = useState(0);
  const [ok, setOk] = useState(0);
  useEffect(() => {
    ensureVennFonts(sheet).then(() => setOk(1));
  }, []);
  const next = () => setN((x) => Math.min(order.length, x + 1));
  const prev = () => setN((x) => Math.max(0, x - 1));
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter" || e.key === "PageDown") (e.preventDefault(), next());
      else if (e.key === "ArrowLeft" || e.key === "Backspace" || e.key === "PageUp") (e.preventDefault(), prev());
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [order.length]);
  const reveal = useMemo(() => new Set(order.slice(0, n)), [order, n]);
  const html = useMemo(() => vennSvg(sheet, reveal), [sheet, reveal, ok]);
  const g = vennBlocks(v);
  return (
    <div className="tbl-present venn-present" onClick={next}>
      <div className="tbl-stage">
        <svg viewBox={`-20 -10 ${g.w + 40} ${g.h + 20}`} style={{ width: "100%", height: "100%", background: "#fff" }} preserveAspectRatio="xMidYMid meet" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
      <div className="tbl-ctrl" onClick={(e) => e.stopPropagation()}>
        <button className="btn small" onClick={prev} disabled={n === 0}>◀ Sebelumnya</button>
        <span className="small">{n}/{order.length}</span>
        <button className="btn small primary" onClick={next} disabled={n >= order.length}>Berikutnya ▶</button>
        <button className="btn small" onClick={() => setN(order.length)}>Tampilkan semua</button>
        <div className="spacer" />
        <button className="btn small" onClick={onClose}>✕ Tutup</button>
      </div>
    </div>
  );
}
