import { useEffect, useMemo, useRef, useState } from "react";
import Canvas, { CanvasHandle } from "./Canvas";
import { computeLayout } from "./layout";
import { Sheet } from "./types";

/** Urutan pembahasan: pra-urutan (topik, lalu anaknya, dst). Cabang yang dilipat penyusun dilewati. */
function order(sheet: Sheet): string[] {
  const out: string[] = [];
  const walk = (id: string) => {
    const n = sheet.nodes[id];
    if (!n) return;
    out.push(id);
    if (n.collapsed) return;
    for (const c of n.children) if (!sheet.nodes[c]?.summary) walk(c);
  };
  walk(sheet.rootId);
  return out;
}

const noop = () => {};

/** Presentasi Peta: peta tetap satu layar, terbuka bertahap, kamera mengikuti topik yang dibahas. */
export default function MapPresenter({ sheet, onClose, onAttach }: { sheet: Sheet; onClose(): void; onAttach(id: string): void }) {
  const seq = useMemo(() => order(sheet), [sheet]);
  const [n, setN] = useState(1);
  const cv = useRef<CanvasHandle>(null);
  const cur = seq[n - 1];

  // peta yang tampil: hanya topik yang sudah dibahas
  const shown = useMemo(() => {
    const seen = new Set(seq.slice(0, n));
    const nodes: Sheet["nodes"] = {};
    for (const id of Object.keys(sheet.nodes)) {
      const nd = sheet.nodes[id];
      nodes[id] = { ...nd, collapsed: undefined, children: nd.children.filter((c) => seen.has(c) || (sheet.nodes[c]?.summary && seen.has(sheet.nodes[c].summary!.from) && seen.has(sheet.nodes[c].summary!.to))) };
    }
    // topik yang sedang dibahas: tulisan dibesarkan, lalu kembali normal saat pindah
    const c = nodes[seq[n - 1]];
    if (c) {
      let depth = 0;
      for (let p = c.parentId; p && nodes[p]; p = nodes[p].parentId) depth++;
      const base = c.fontSize ?? (depth === 0 ? 20 : depth === 1 ? 16 : 14);
      const coarse = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
      nodes[c.id] = { ...c, fontSize: Math.round(base * (coarse ? 1.7 : 1.5)) };
    }
    return { ...sheet, nodes } as Sheet;
  }, [sheet, seq, n]);
  const layout = useMemo(() => computeLayout(shown), [shown]);

  const next = () => setN((x) => Math.min(seq.length, x + 1));
  const prev = () => setN((x) => Math.max(1, x - 1));

  useEffect(() => {
    const t = setTimeout(() => {
      const el = document.querySelector(".map-stage") as HTMLElement | null;
      if (!el) return;
      const { width: w, height: h } = el.getBoundingClientRect();
      const coarse = matchMedia("(pointer: coarse)").matches;
      const minK = coarse ? 0.7 : 0.8;
      const b = layout.bounds;
      const fitK = Math.min(1.3, (w - 60) / Math.max(b.w, 1), (h - 60) / Math.max(b.h, 1));
      if (n === 1 || fitK >= minK) cv.current?.glidePoint(b.x + b.w / 2, b.y + b.h / 2, Math.max(fitK, minK), n === 1 ? 1 : 650);
      else {
        const ln = layout.nodes[cur];
        if (ln) cv.current?.glidePoint(ln.x + ln.w / 2 + Math.min(120, (w / minK) * 0.15), ln.y + ln.h / 2, minK, 650);
      }
    }, 30);
    return () => clearTimeout(t);
  }, [n, layout, cur]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (["ArrowRight", "ArrowDown", " ", "Enter", "PageDown"].includes(e.key)) (e.preventDefault(), next());
      else if (["ArrowLeft", "ArrowUp", "Backspace", "PageUp"].includes(e.key)) (e.preventDefault(), prev());
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [seq.length]);

  const att = sheet.nodes[cur]?.attachments?.length || 0;
  const showAll = () => {
    setN(seq.length);
    setTimeout(() => cv.current?.fit(), 60);
  };

  return (
    <div className="map-present">
      <div className="map-stage">
        <Canvas
          ref={cv}
          sheet={shown}
          layout={layout}
          selectedId={cur}
          selFloat={null}
          editingId={null}
          fitKey={0}
          multiIds={[]}
          multiMode={false}
          onSelect={noop}
          onSelectFloat={noop}
          onStartEdit={noop}
          onCommitEdit={noop}
          onCancelEdit={noop}
          onMove={noop}
          onToggleCollapse={noop}
          onFloatChange={noop}
          onOpenAttachments={onAttach}
        />
        <div
          className="map-hit"
          onClick={(e) => {
            const clip = document.elementsFromPoint(e.clientX, e.clientY).find((x) => x.closest("[data-clip]"))?.closest("[data-clip]");
            if (clip) onAttach(clip.getAttribute("data-clip")!);
            else next();
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            prev();
          }}
          onWheel={(e) => (e.deltaY > 0 ? next() : e.deltaY < 0 && prev())}
        />
      </div>
      <div className="tbl-ctrl" onClick={(e) => e.stopPropagation()}>
        <button className="btn small" onClick={prev} disabled={n <= 1}>◀ Sebelumnya</button>
        <span className="small">{n}/{seq.length}</span>
        <button className="btn small primary" onClick={next} disabled={n >= seq.length}>Berikutnya ▶</button>
        {att > 0 && <button className="btn small" onClick={() => onAttach(cur)}>📎 Lampiran ({att})</button>}
        <button className="btn small" onClick={showAll}>Lihat semua</button>
        <div className="spacer" />
        <button className="btn small" onClick={onClose}>✕ Tutup</button>
      </div>
    </div>
  );
}
