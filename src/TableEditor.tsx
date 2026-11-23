import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ensureFonts, familyCss, FONTS, isRtl } from "./fonts";
import { cellFontId, cellLineH, cloneTable, deleteCol, deleteRow, insertCol, insertRow, keyOf, pasteGrid, resolveCell } from "./table";
import { CellStyle, Sheet, TableData } from "./types";

type Sel = { kind: "cell" | "row" | "col" | "all"; r: number; c: number };

interface Props {
  sheet: Sheet;
  onChange(fn: (t: TableData) => TableData): void;
  onPresent(): void;
  onFocusMode?(): void;
}

const BG = ["#ffffff", "#fef3c7", "#d1fae5", "#dbeafe", "#fce7f3", "#fee2e2", "#ede9fe", "#0f766e", "#4f46e5", "#1e293b"];
const FG = ["#0f172a", "#ffffff", "#dc2626", "#2563eb", "#059669", "#7c3aed", "#b45309"];
const HEAD = ["#0f766e", "#4f46e5", "#1e293b", "#b45309", "#be185d", "#2563eb"];

function cellsOf(sel: Sel, t: TableData): [number, number][] {
  const out: [number, number][] = [];
  for (let r = 0; r < t.rows; r++)
    for (let c = 0; c < t.cols; c++) {
      if (sel.kind === "all" || (sel.kind === "cell" && sel.r === r && sel.c === c) || (sel.kind === "row" && sel.r === r) || (sel.kind === "col" && sel.c === c)) out.push([r, c]);
    }
  return out;
}

function Cell(p: {
  t: TableData;
  r: number;
  c: number;
  tick: number;
  active: boolean;
  onFocus(): void;
  onCommit(v: string): void;
  onKey(e: React.KeyboardEvent<HTMLTextAreaElement>): void;
  onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>): void;
}) {
  const { t, r, c } = p;
  const text = t.cells[r]?.[c] ?? "";
  const [v, setV] = useState(text);
  useEffect(() => setV(text), [text]);
  const ref = useRef<HTMLTextAreaElement>(null);
  const res = resolveCell(t, r, c);
  const rtl = isRtl(v);
  const fam = familyCss(cellFontId(t, v));
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [v, res.size, t.colW[c], p.tick, t.arFont, t.font, res.bold]);
  return (
    <textarea
      id={`tc-${r}-${c}`}
      ref={ref}
      rows={1}
      dir="auto"
      className={"tcell" + (p.active ? " active" : "")}
      value={v}
      spellCheck={false}
      onChange={(e) => setV(e.target.value)}
      onFocus={p.onFocus}
      onBlur={() => v !== text && p.onCommit(v)}
      onKeyDown={p.onKey}
      onPaste={p.onPaste}
      style={{
        background: res.bg,
        color: res.color,
        fontWeight: res.bold ? 700 : 400,
        fontFamily: fam,
        fontSize: res.size,
        lineHeight: cellLineH(res.size, rtl) + "px",
        textAlign: res.align === "c" ? "center" : res.align === "l" ? "left" : "right",
      }}
    />
  );
}

export default function TableEditor({ sheet, onChange, onPresent, onFocusMode }: Props) {
  const t = sheet.table!;
  const [sel, setSel] = useState<Sel>({ kind: "cell", r: 0, c: 0 });
  const [tick, setTick] = useState(0);
  const [live, setLive] = useState<number[] | null>(null);
  const narrow = typeof matchMedia !== "undefined" && matchMedia("(max-width: 720px)").matches;
  const [tools, setTools] = useState(!narrow);
  const [zoom, setZoom] = useState(() => (narrow ? 0.85 : 1));
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const scrollEl = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollEl.current;
    if (el && t.rtl) el.scrollLeft = el.scrollWidth;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // cubit dua jari untuk memperbesar/memperkecil tabel
  useEffect(() => {
    const el = scrollEl.current;
    if (!el) return;
    let d0 = 0,
      z0 = 1;
    const dist = (e: TouchEvent) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    const ts = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        d0 = dist(e);
        z0 = zoomRef.current;
      }
    };
    const tm = (e: TouchEvent) => {
      if (e.touches.length === 2 && d0) {
        e.preventDefault();
        setZoom(Math.max(0.4, Math.min(2.5, z0 * (dist(e) / d0))));
      }
    };
    const te = () => (d0 = 0);
    el.addEventListener("touchstart", ts, { passive: true });
    el.addEventListener("touchmove", tm, { passive: false });
    el.addEventListener("touchend", te);
    return () => {
      el.removeEventListener("touchstart", ts);
      el.removeEventListener("touchmove", tm);
      el.removeEventListener("touchend", te);
    };
  }, []);
  const thRefs = useRef<(HTMLTableCellElement | null)[]>([]);
  const W = live ?? t.colW;
  const setW = W.filter((w) => w > 0);
  const anySet = setW.length > 0;
  const avgW = anySet ? setW.reduce((a, b) => a + b, 0) / setW.length : 1;
  const wOf = (c: number) => (W[c] > 0 ? W[c] : avgW);
  const totalW = Array.from({ length: t.cols }, (_, c) => wOf(c)).reduce((a, b) => a + b, 0);
  const startResize = (c: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const px = Array.from({ length: t.cols }, (_, i) => thRefs.current[i]?.offsetWidth || 100);
    const x0 = e.clientX;
    const dir = t.rtl ? -1 : 1;
    const j = c + 1;
    const MIN = 50;
    let last = px;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - x0) * dir;
      const wi = Math.max(MIN, Math.min(px[c] + px[j] - MIN, px[c] + dx));
      const n = px.slice();
      n[c] = wi;
      n[j] = px[c] + px[j] - wi;
      last = n;
      setLive(n);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const done = last.map((v) => Math.round(v));
      setLive(null);
      onChange((x) => ({ ...x, colW: done }));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  useEffect(() => {
    ensureFonts([t.font, t.arFont]).then(() => setTick((x) => x + 1));
  }, [t.font, t.arFont]);

  const focusCell = (r: number, c: number) => window.setTimeout(() => (document.getElementById(`tc-${r}-${c}`) as HTMLTextAreaElement | null)?.focus(), 30);
  const setCell = (r: number, c: number, v: string) =>
    onChange((x) => {
      const n = cloneTable(x);
      if (n.cells[r]) n.cells[r][c] = v;
      return n;
    });
  const style = (patch: CellStyle) =>
    onChange((x) => {
      const n = cloneTable(x);
      for (const [r, c] of cellsOf(sel, x)) n.style[keyOf(r, c)] = { ...n.style[keyOf(r, c)], ...patch };
      return n;
    });
  const set = (patch: Partial<TableData>) => onChange((x) => ({ ...x, ...patch }));

  const onKey = (r: number, c: number) => (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      setCell(r, c, e.currentTarget.value);
      if (r === t.rows - 1) onChange((x) => insertRow(x, x.rows));
      focusCell(r + 1, c);
    } else if (e.key === "Tab") {
      e.preventDefault();
      setCell(r, c, e.currentTarget.value);
      let nr = r,
        nc = c + (e.shiftKey ? -1 : 1);
      if (nc >= t.cols) (nc = 0), nr++;
      if (nc < 0) (nc = t.cols - 1), nr--;
      if (nr < 0) return;
      if (nr >= t.rows) onChange((x) => insertRow(x, x.rows));
      focusCell(nr, nc);
    } else if (e.key === "Escape") (e.currentTarget as HTMLTextAreaElement).blur();
  };
  const onPaste = (r: number, c: number) => (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const txt = e.clipboardData.getData("text");
    if (/[\t\n]/.test(txt.trim())) {
      e.preventDefault();
      onChange((x) => pasteGrid(x, r, c, txt));
    }
  };

  const ar = sel.kind === "all" ? 0 : sel.r;
  const ac = sel.kind === "all" ? 0 : sel.c;
  const colSel = sel.kind === "col" || sel.kind === "cell" ? sel.c : 0;
  const rowsSel = sel.kind === "col" ? 0 : ar;

  return (
    <div className="tbl-wrap">
      <div className="tbl-top">
        <button className={"btn small" + (tools ? " active" : "")} onClick={() => setTools((v) => !v)}>
          🛠 Alat tabel {tools ? "▴" : "▾"}
        </button>
        {onFocusMode && (
          <button className="btn small" onClick={onFocusMode} title="Sembunyikan semua menu agar fokus ke materi">
            ⛶ Fokus
          </button>
        )}
        <div className="spacer" />
        <button className="btn primary small" onClick={onPresent}>▶ Tampilkan bertahap</button>
      </div>
      <div className="tbl-bar" hidden={!tools}>
        <div className="tbl-group">
          <span className="tbl-label">Baris</span>
          <button className="btn small" onClick={() => onChange((x) => insertRow(x, rowsSel))} title="Sisipkan baris di atas">＋▲</button>
          <button className="btn small" onClick={() => onChange((x) => insertRow(x, rowsSel + 1))} title="Sisipkan baris di bawah">＋▼</button>
          <button className="btn small danger" onClick={() => onChange((x) => deleteRow(x, rowsSel))} title="Hapus baris">✕</button>
        </div>
        <div className="tbl-group">
          <span className="tbl-label">Kolom</span>
          <button className="btn small" onClick={() => onChange((x) => insertCol(x, x.rtl ? colSel + 1 : colSel))} title="Sisipkan kolom di kiri">◀＋</button>
          <button className="btn small" onClick={() => onChange((x) => insertCol(x, x.rtl ? colSel : colSel + 1))} title="Sisipkan kolom di kanan">＋▶</button>
          <button className="btn small danger" onClick={() => onChange((x) => deleteCol(x, colSel))} title="Hapus kolom">✕</button>
          <button className="btn small" onClick={() => onChange((x) => ({ ...x, colW: Array(x.cols).fill(0) }))} title="Kembalikan lebar semua kolom ke otomatis">Lebar otomatis</button>
        </div>
        <div className="tbl-group">
          <span className="tbl-label">Header</span>
          <button className="btn small" onClick={() => set({ headRows: Math.max(0, t.headRows - 1) })}>−</button>
          <span className="small">{t.headRows} baris</span>
          <button className="btn small" onClick={() => set({ headRows: Math.min(t.rows, t.headRows + 1) })}>＋</button>
          <button className="btn small" onClick={() => set({ headCols: Math.max(0, t.headCols - 1) })}>−</button>
          <span className="small">{t.headCols} kolom</span>
          <button className="btn small" onClick={() => set({ headCols: Math.min(t.cols, t.headCols + 1) })}>＋</button>
          {HEAD.map((h) => (
            <button key={h} className={"swatch" + (t.headBg === h ? " on" : "")} style={{ background: h }} onClick={() => set({ headBg: h })} aria-label={h} />
          ))}
        </div>
        <div className="tbl-group">
          <button className={"btn small" + (t.rtl ? " active" : "")} onClick={() => set({ rtl: !t.rtl })} title="Arah tabel: kolom pertama di kanan (Arab) atau di kiri">
            {t.rtl ? "⇠ Arab (kanan→kiri)" : "⇢ Latin (kiri→kanan)"}
          </button>
          <button className={"btn small" + (t.stripe ? " active" : "")} onClick={() => set({ stripe: !t.stripe })} title="Baris selang-seling">▤</button>
          <button className="btn small" onClick={() => set({ fontSize: Math.max(10, t.fontSize - 2) })} title="Perkecil huruf">A−</button>
          <button className="btn small" onClick={() => set({ fontSize: Math.min(60, t.fontSize + 2) })} title="Perbesar huruf">A＋</button>
          <select className="small" value={t.arFont} onChange={(e) => set({ arFont: e.target.value })} title="Font Arab">
            {FONTS.filter((f) => f.group === "Arab").map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <select className="small" value={t.font} onChange={(e) => set({ font: e.target.value })} title="Font Indonesia/Latin">
            {FONTS.filter((f) => f.group !== "Arab").map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>
        <div className="tbl-group">
          <span className="tbl-label">{sel.kind === "cell" ? "Sel" : sel.kind === "row" ? "Baris" : sel.kind === "col" ? "Kolom" : "Semua"}</span>
          {BG.map((h) => (
            <button key={h} className="swatch" style={{ background: h }} onClick={() => style({ bg: h })} aria-label={"isi " + h} />
          ))}
          <button className="swatch reset" onClick={() => style({ bg: undefined })} title="Isi otomatis">⟲</button>
          {FG.map((h) => (
            <button key={h} className="swatch txt" style={{ color: h, background: h === "#ffffff" ? "#64748b" : "#fff" }} onClick={() => style({ color: h })} aria-label={"teks " + h}>A</button>
          ))}
          <button className="btn small" onClick={() => style({ bold: true })}><b>B</b></button>
          <button className="btn small" onClick={() => style({ bold: false })}>b</button>
          <button className="btn small" onClick={() => style({ align: "l" })} title="Rata kiri">⇤</button>
          <button className="btn small" onClick={() => style({ align: "c" })} title="Tengah">≡</button>
          <button className="btn small" onClick={() => style({ align: "r" })} title="Rata kanan">⇥</button>
          <button className="btn small" onClick={() => style({ size: t.fontSize + 4 })} title="Huruf sel lebih besar">▲</button>
          <button className="btn small" onClick={() => style({ size: Math.max(9, t.fontSize - 4) })} title="Huruf sel lebih kecil">▼</button>
          <button className="btn small" onClick={() => style({ size: undefined, bold: undefined, align: undefined, color: undefined })} title="Reset gaya sel">⟲</button>
        </div>
      </div>
      <div className="tbl-hint small muted" hidden={!tools}>
        Ketik langsung di sel · <kbd>Enter</kbd> turun · <kbd>Tab</kbd> ke sel berikut · <kbd>Shift</kbd>+<kbd>Enter</kbd> baris baru dalam sel · tempel (Ctrl+V) tabel dari Word/Excel akan mengisi banyak sel sekaligus · klik nomor baris/kolom untuk memilihnya.
      </div>
      <div className="tbl-scroll" ref={scrollEl}>
        <table className="tbl" dir={t.rtl ? "rtl" : "ltr"} style={{ width: "calc(100% - 34px)", minWidth: 34 + t.cols * 120, marginInlineStart: 34, tableLayout: anySet ? "fixed" : "auto", zoom }}>
          <colgroup>
            <col style={{ width: 0 }} />
            {Array.from({ length: t.cols }, (_, c) => (
              <col key={c} style={anySet ? { width: `${(wOf(c) / totalW) * 100}%` } : { minWidth: 90 }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="tbl-corner tbl-gut" onClick={() => setSel({ kind: "all", r: 0, c: 0 })} title="Pilih semua" />
              {Array.from({ length: t.cols }, (_, c) => (
                <th key={c} ref={(el) => (thRefs.current[c] = el)} className={"tbl-h" + ((sel.kind === "col" && sel.c === c) ? " on" : "")} onClick={() => setSel({ kind: "col", r: 0, c })}>
                  {c + 1}
                  {c < t.cols - 1 && <span className="col-grip" onPointerDown={startResize(c)} onClick={(e) => e.stopPropagation()} title="Seret untuk mengubah lebar kolom" />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: t.rows }, (_, r) => (
              <tr key={r}>
                <th className={"tbl-h tbl-gut" + (sel.kind === "row" && sel.r === r ? " on" : "")} onClick={() => setSel({ kind: "row", r, c: 0 })}>
                  {r + 1}
                </th>
                {Array.from({ length: t.cols }, (_, c) => (
                  <td key={c}>
                    <Cell
                      t={t}
                      r={r}
                      c={c}
                      tick={tick}
                      active={sel.kind === "cell" ? sel.r === r && sel.c === c : cellsOf(sel, t).some(([a, b]) => a === r && b === c)}
                      onFocus={() => setSel({ kind: "cell", r, c })}
                      onCommit={(v) => setCell(r, c, v)}
                      onKey={onKey(r, c)}
                      onPaste={onPaste(r, c)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="tbl-zoom">
        <button className="btn icon" onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))} aria-label="Perbesar tabel">＋</button>
        <button className="btn icon" onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.15).toFixed(2)))} aria-label="Perkecil tabel">−</button>
        <button className="btn icon" onClick={() => setZoom(1)} aria-label="Ukuran 100%" title="100%">1:1</button>
      </div>
    </div>
  );
}
