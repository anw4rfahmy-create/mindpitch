import { useEffect, useMemo, useRef, useState } from "react";
import { BLOCK_H, BLOCK_W, VENN_LAYOUTS, VENN_PALETTE, ensureVennFonts, newDiagram, regionAt, regionKeys, regionName, setCount, vennBlocks, vennSpec, vennSvg } from "./venn";
import { Sheet, VennData, VennLayout } from "./types";

interface Props {
  sheet: Sheet;
  onChange(fn: (v: VennData) => VennData): void;
  onPresent(): void;
}

type Target = { d: number; kind: "region"; key: string } | { d: number; kind: "set"; i: number } | { d: number; kind: "title" };

const TITLE_H = 56;
const same = (a: Target, b: Target) => JSON.stringify(a) === JSON.stringify(b);

export default function VennEditor({ sheet, onChange, onPresent }: Props) {
  const v = sheet.venn!;
  const [sel, setSel] = useState<Target>({ d: 0, kind: "region", key: regionKeys(v.diagrams[0].layout)[0] });
  const [fontsOk, setFontsOk] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const geom = useMemo(() => vennBlocks(v), [v.diagrams.length, v.cols]);

  useEffect(() => {
    ensureVennFonts(sheet).then(() => setFontsOk((n) => n + 1));
  }, [v.font, v.arFont]);

  // pastikan pilihan masih valid
  const d = Math.min(sel.d, v.diagrams.length - 1);
  const dia = v.diagrams[d];
  useEffect(() => {
    if (sel.d !== d) setSel({ d, kind: "title" });
    else if (sel.kind === "region" && !regionKeys(dia.layout).includes(sel.key)) setSel({ d, kind: "region", key: regionKeys(dia.layout)[0] });
    else if (sel.kind === "set" && sel.i >= setCount(dia.layout)) setSel({ d, kind: "title" });
  }, [sel, d, dia.layout]);

  const svgHtml = useMemo(() => vennSvg(sheet), [v, fontsOk]);

  const patch = (di: number, fn: (x: VennData["diagrams"][number]) => VennData["diagrams"][number]) =>
    onChange((x) => ({ ...x, diagrams: x.diagrams.map((q, i) => (i === di ? fn(q) : q)) }));

  // ---- hit-test
  const pick = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    if (!m) return;
    const p = pt.matrixTransform(m.inverse());
    for (const b of geom.blocks) {
      if (p.x < b.x || p.x > b.x + b.w || p.y < b.y || p.y > b.y + b.h) continue;
      const lx = p.x - b.x,
        ly = p.y - b.y;
      const di = b.i;
      const layout = v.diagrams[di].layout;
      if (ly < TITLE_H - 6) return setSel({ d: di, kind: "title" });
      const spec = vennSpec(layout);
      for (let i = 0; i < setCount(layout); i++) {
        const lb = spec.labels[i];
        if (Math.abs(lx - lb.x) < 85 && Math.abs(ly - TITLE_H - lb.y) < 20) return setSel({ d: di, kind: "set", i });
      }
      const key = regionAt(layout, lx, ly - TITLE_H);
      if (key) setSel({ d: di, kind: "region", key });
      else setSel({ d: di, kind: "title" });
      return;
    }
  };

  // ---- panel edit (disimpan tunda agar riwayat tidak penuh)
  const cur: string =
    sel.kind === "region" ? dia.text[sel.key] ?? "" : sel.kind === "set" ? dia.sets[sel.i].name : dia.title;
  const [draft, setDraft] = useState(cur);
  const tgt = useRef<Target>(sel);
  const timer = useRef<number>();
  useEffect(() => {
    setDraft(cur);
    tgt.current = sel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(sel), d]);
  const commit = (t: Target, val: string) => {
    patch(t.d, (q) => {
      if (t.kind === "region") return { ...q, text: { ...q.text, [t.key]: val } };
      if (t.kind === "set") return { ...q, sets: q.sets.map((s, i) => (i === t.i ? { ...s, name: val } : s)) };
      return { ...q, title: val };
    });
  };
  const type = (val: string) => {
    setDraft(val);
    const t = tgt.current;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => commit(t, val), 350);
  };
  const flush = () => {
    window.clearTimeout(timer.current);
    if (draft !== cur && same(tgt.current, sel)) commit(tgt.current, draft);
  };

  const addDiagram = () => {
    if (v.diagrams.length >= 8) return;
    flush();
    onChange((x) => ({ ...x, diagrams: [...x.diagrams, newDiagram(dia.layout)], cols: x.diagrams.length >= 1 ? 2 : x.cols }));
    setSel({ d: v.diagrams.length, kind: "title" });
  };
  const removeDiagram = () => {
    if (v.diagrams.length < 2) return;
    onChange((x) => ({ ...x, diagrams: x.diagrams.filter((_, i) => i !== d) }));
    setSel({ d: Math.max(0, d - 1), kind: "title" });
  };

  // ---- sorotan pilihan
  const hl = (() => {
    const b = geom.blocks[d];
    if (!b) return null;
    const spec = vennSpec(dia.layout);
    if (sel.kind === "region" && spec.anchors[sel.key]) {
      const a = spec.anchors[sel.key];
      return { x: b.x + a.x - a.w / 2 - 4, y: b.y + TITLE_H + a.y - a.h / 2 - 4, w: a.w + 8, h: a.h + 8 };
    }
    if (sel.kind === "set") {
      const lb = spec.labels[sel.i];
      return lb ? { x: b.x + lb.x - 90, y: b.y + TITLE_H + lb.y - 20, w: 180, h: 40 } : null;
    }
    return { x: b.x + 70, y: b.y + 4, w: BLOCK_W - 140, h: 44 };
  })();

  const label =
    sel.kind === "region" ? regionName(dia.layout, sel.key, dia) : sel.kind === "set" ? `Nama lingkaran ${"ABC"[sel.i]}` : "Judul diagram";

  const W = geom.w + 40,
    H = geom.h + 40;

  return (
    <div className="venn-wrap">
      <div className="venn-bar">
        <button className="btn small" onClick={addDiagram} disabled={v.diagrams.length >= 8} title="Tambah diagram lain dalam lembar ini (mis. untuk membandingkan)">
          ＋ Diagram
        </button>
        <label className="tbl-field">
          Susunan
          <select
            value={dia.layout}
            onChange={(e) => {
              flush();
              patch(d, (q) => ({ ...q, layout: e.target.value as VennLayout }));
            }}
          >
            {VENN_LAYOUTS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        {v.diagrams.length > 1 && (
          <label className="tbl-field">
            Kolom
            <select value={v.cols} onChange={(e) => onChange((x) => ({ ...x, cols: e.target.value === "2" ? 2 : 1 }))}>
              <option value="1">1</option>
              <option value="2">2</option>
            </select>
          </label>
        )}
        <span className="tbl-field">
          Huruf
          <button className="btn small" onClick={() => onChange((x) => ({ ...x, fontSize: Math.max(12, x.fontSize - 2) }))}>A−</button>
          <button className="btn small" onClick={() => onChange((x) => ({ ...x, fontSize: Math.min(48, x.fontSize + 2) }))}>A＋</button>
        </span>
        <div className="spacer" />
        {v.diagrams.length > 1 && (
          <button className="btn small danger" onClick={removeDiagram}>
            Hapus diagram {d + 1}
          </button>
        )}
      </div>

      <div className="venn-stage">
        <svg ref={svgRef} viewBox={`-20 -20 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" onPointerDown={pick} style={{ touchAction: "manipulation" }}>
          <g dangerouslySetInnerHTML={{ __html: svgHtml }} />
          {hl && <rect x={hl.x} y={hl.y} width={hl.w} height={hl.h} rx={10} fill="none" stroke="#4f46e5" strokeWidth={3} strokeDasharray="8 6" pointerEvents="none" />}
          {v.diagrams.length > 1 &&
            geom.blocks.map((b) => (
              <text key={b.i} x={b.x + 8} y={b.y + 14} fontSize={16} fontWeight={700} fill={b.i === d ? "#4f46e5" : "#94a3b8"} pointerEvents="none">
                {b.i + 1}
              </text>
            ))}
        </svg>
      </div>

      <div className="venn-edit">
        <div className="small muted">
          Diagram {d + 1} · <b>{label}</b> <span className="hide-sm">— ketuk bagian lain pada gambar untuk memilih area, nama, atau judul</span>
        </div>
        {sel.kind === "region" ? (
          <textarea dir="auto" rows={3} value={draft} placeholder="Ketik isi area ini…" onChange={(e) => type(e.target.value)} onBlur={flush} />
        ) : (
          <input dir="auto" value={draft} placeholder={sel.kind === "set" ? "Nama lingkaran…" : "Judul diagram (opsional)…"} onChange={(e) => type(e.target.value)} onBlur={flush} />
        )}
        {sel.kind === "set" && (
          <div className="tbl-sw" style={{ marginTop: 6 }}>
            {VENN_PALETTE.map((c) => (
              <button
                key={c}
                className={"swatch" + (dia.sets[sel.i].color === c ? " on" : "")}
                style={{ background: c }}
                aria-label={"warna " + c}
                onClick={() => patch(d, (q) => ({ ...q, sets: q.sets.map((s, i) => (i === sel.i ? { ...s, color: c } : s)) }))}
              />
            ))}
          </div>
        )}
        <div className="small muted" style={{ marginTop: 4 }}>
          <button className="btn small" onClick={onPresent}>▶ Presentasi bertahap</button>
        </div>
      </div>
    </div>
  );
}
