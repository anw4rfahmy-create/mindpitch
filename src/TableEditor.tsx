import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ensureFonts, familyCss, FONTS, isRtl } from "./fonts";
import { cellFontId, cellLineH, cloneTable, columnWidths, deleteCol, deleteRow, expandRect, hasMergeIn, insertCol, insertRow, keyOf, mergeMaps, mergeRect, pasteGrid, Rect, resolveCell, splitRect, stripeModeOf, TABLE_STYLES, tableGeom } from "./table";
import { CellStyle, Sheet, StripeMode, TableData } from "./types";

type Sel = { kind: "cell" | "row" | "col" | "all" | "range"; r: number; c: number; r2?: number; c2?: number };

interface Props {
  sheet: Sheet;
  onChange(fn: (t: TableData) => TableData): void;
  onPresent(): void;
  onFocusMode?(): void;
  tools: boolean;
  onTools(v: boolean): void;
}

const BG = ["#ffffff", "#fef3c7", "#d1fae5", "#dbeafe", "#fce7f3", "#fee2e2", "#ede9fe", "#0f766e", "#4f46e5", "#1e293b"];
const FG = ["#0f172a", "#ffffff", "#dc2626", "#2563eb", "#059669", "#7c3aed", "#b45309"];
const HEAD = ["#0f766e", "#4f46e5", "#1e293b", "#b45309", "#be185d", "#2563eb"];

function rectOf(sel: Sel, t: TableData): Rect {
  if (sel.kind === "all") return { r0: 0, c0: 0, r1: t.rows - 1, c1: t.cols - 1 };
  if (sel.kind === "row") return { r0: sel.r, c0: 0, r1: sel.r, c1: t.cols - 1 };
  if (sel.kind === "col") return { r0: 0, c0: sel.c, r1: t.rows - 1, c1: sel.c };
  if (sel.kind === "range") return { r0: Math.min(sel.r, sel.r2 ?? sel.r), c0: Math.min(sel.c, sel.c2 ?? sel.c), r1: Math.max(sel.r, sel.r2 ?? sel.r), c1: Math.max(sel.c, sel.c2 ?? sel.c) };
  return { r0: sel.r, c0: sel.c, r1: sel.r, c1: sel.c };
}

function cellsOf(sel: Sel, t: TableData): [number, number][] {
  const out: [number, number][] = [];
  for (let r = 0; r < t.rows; r++)
    for (let c = 0; c < t.cols; c++) {
      if (sel.kind === "range") {
        const R = rectOf(sel, t);
        if (r >= R.r0 && r <= R.r1 && c >= R.c0 && c <= R.c1) out.push([r, c]);
        continue;
      }
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
  pick?: boolean;
  onPick?(shift: boolean): void;
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
      readOnly={p.pick}
      inputMode={p.pick ? "none" : undefined}
      onPointerDown={(e) => {
        if (p.pick || e.shiftKey) {
          e.preventDefault();
          p.onPick?.(e.shiftKey);
        }
      }}
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

export default function TableEditor({ sheet, onChange, onPresent, onFocusMode, tools, onTools }: Props) {
  const t = sheet.table!;
  const [sel, setSel] = useState<Sel>({ kind: "cell", r: 0, c: 0 });
  const [tick, setTick] = useState(0);
  const [live, setLive] = useState<number[] | null>(null);
  const [pickMode, setPickMode] = useState(false);
  const origin = useRef<{ r: number; c: number }>({ r: 0, c: 0 });
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const userZoom = useRef(false);
  const fitted = useRef<string>("");
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [th, setTh] = useState(300);
  const scrollEl = useRef<HTMLDivElement>(null);
  const tblEl = useRef<HTMLTableElement>(null);
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;

  const userSetZoom = (z: number) => {
    userZoom.current = true;
    setZoom(Math.max(0.15, Math.min(3, +z.toFixed(3))));
  };

  // ukuran area gulir & tinggi tabel
  useEffect(() => {
    const el = scrollEl.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const el = tblEl.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTh(el.offsetHeight));
    ro.observe(el);
    setTh(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  // pas layar: seluruh tabel terlihat (hanya memperkecil; pengguna yang memperbesar sendiri)
  const fitNow = useCallback(() => {
    const b = scrollEl.current;
    if (!b || !b.clientWidth) return;
    const g = tableGeom(sheetRef.current);
    const z = Math.min(1, (b.clientWidth - 46) / Math.max(1, g.w), (b.clientHeight - 50) / Math.max(1, g.h + 28));
    userZoom.current = false;
    setZoom(Math.max(0.15, +z.toFixed(3)));
    b.scrollTo({ left: sheetRef.current.table!.rtl ? b.scrollWidth : 0, top: 0 });
  }, []);
  useEffect(() => {
    ensureFonts([t.font, t.arFont]).then(() => setTick((x) => x + 1));
  }, [t.font, t.arFont]);
  useEffect(() => {
    if (!box.w || userZoom.current) return;
    // pertama kali per lembar, dan saat ukuran layar berubah (mis. diputar)
    fitNow();
    fitted.current = sheet.id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box.w, box.h, sheet.id, tick]);
  useEffect(() => {
    const el = scrollEl.current;
    if (el && t.rtl) el.scrollLeft = el.scrollWidth;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, box.w]);

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
        userZoom.current = true;
        setZoom(Math.max(0.15, Math.min(3, z0 * (dist(e) / d0))));
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

  const g = tableGeom(sheet);
  const thRefs = useRef<(HTMLTableCellElement | null)[]>([]);
  const widths = live ?? g.colW;
  const sumW = widths.reduce((a, b) => a + b, 0) || 1;
  const natW = Math.max(g.w, (box.w - 46) / zoom);
  const { anchors, covered } = mergeMaps(t);

  const startResize = (c: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const px = Array.from({ length: t.cols }, (_, i) => thRefs.current[i]?.offsetWidth || 100);
    const x0 = e.clientX;
    const dir = (t.rtl ? -1 : 1) / zoomRef.current;
    const j = c + 1;
    const MIN = 40;
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
      const k = g.w / (last.reduce((a, b) => a + b, 0) || 1);
      const done = last.map((v) => Math.round(v * k));
      setLive(null);
      onChange((x) => ({ ...x, colW: done }));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const nudgeCol = (c: number, f: number) =>
    onChange((x) => {
      const base = g.colW.map((v) => Math.round(v));
      base[c] = Math.round(Math.max(40, Math.min(700, base[c] * f)));
      return { ...x, colW: base };
    });

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

  const nextVisible = (r: number, c: number, dr: number, dc: number): [number, number] => {
    let nr = r + dr,
      nc = c + dc;
    while (nr >= 0 && nr < t.rows && nc >= 0 && nc < t.cols && covered.has(keyOf(nr, nc))) (nr += dr), (nc += dc);
    return [nr, nc];
  };
  const onKey = (r: number, c: number) => (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mg = anchors.get(keyOf(r, c));
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      setCell(r, c, e.currentTarget.value);
      const rr = r + (mg?.rs ?? 1);
      if (rr >= t.rows) onChange((x) => insertRow(x, x.rows));
      focusCell(rr, c);
    } else if (e.key === "Tab") {
      e.preventDefault();
      setCell(r, c, e.currentTarget.value);
      let nr = r,
        nc = c + (e.shiftKey ? -1 : (mg?.cs ?? 1));
      if (nc >= t.cols) (nc = 0), nr++;
      if (nc < 0) (nc = t.cols - 1), nr--;
      if (nr < 0) return;
      while (nr < t.rows && covered.has(keyOf(nr, nc))) [nr, nc] = nextVisible(nr, nc, 0, e.shiftKey ? -1 : 1);
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
  const pick = (r: number, c: number, shift: boolean) => {
    // shift+klik, atau ketukan kedua pada mode rentang → rentang dari sel awal
    if (shift || (picked.current && (origin.current.r !== r || origin.current.c !== c))) {
      setSel({ kind: "range", r: origin.current.r, c: origin.current.c, r2: r, c2: c });
      picked.current = false;
      return;
    }
    origin.current = { r, c };
    picked.current = true;
    setSel({ kind: "cell", r, c });
  };
  const picked = useRef(false);

  const R = rectOf(sel, t);
  const area = (R.r1 - R.r0 + 1) * (R.c1 - R.c0 + 1);
  const canMerge = area > 1;
  const canSplit = hasMergeIn(t, R);

  const ar = sel.kind === "all" ? 0 : sel.r;
  const colSel = sel.kind === "cell" || sel.kind === "col" || sel.kind === "range" ? Math.min(sel.c, sel.c2 ?? sel.c) : 0;
  const rowsSel = sel.kind === "col" ? 0 : Math.min(ar, sel.r2 ?? ar);
  const mode = stripeModeOf(t);
  const activeKeys = new Set(cellsOf(sel, t).map(([a, b]) => keyOf(a, b)));

  return (
    <div className="tbl-wrap">
      <div className="tbl-top">
        <button className={"btn small" + (tools ? " active" : "")} onClick={() => onTools(!tools)}>
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
          <button className="btn small" onClick={() => onChange((x) => insertRow(x, R.r1 + 1))} title="Sisipkan baris di bawah">＋▼</button>
          <button className="btn small danger" onClick={() => onChange((x) => deleteRow(x, rowsSel))} title="Hapus baris">✕</button>
        </div>
        <div className="tbl-group">
          <span className="tbl-label">Kolom</span>
          <button className="btn small" onClick={() => onChange((x) => insertCol(x, x.rtl ? R.c1 + 1 : colSel))} title="Sisipkan kolom di kiri">◀＋</button>
          <button className="btn small" onClick={() => onChange((x) => insertCol(x, x.rtl ? colSel : R.c1 + 1))} title="Sisipkan kolom di kanan">＋▶</button>
          <button className="btn small danger" onClick={() => onChange((x) => deleteCol(x, colSel))} title="Hapus kolom">✕</button>
          <button className="btn small" onClick={() => nudgeCol(colSel, 1 / 1.15)} title="Sempitkan kolom terpilih">↔−</button>
          <span className="small muted">kol {colSel + 1}</span>
          <button className="btn small" onClick={() => nudgeCol(colSel, 1.15)} title="Lebarkan kolom terpilih">↔＋</button>
          <button className="btn small" onClick={() => onChange((x) => ({ ...x, colW: Array(x.cols).fill(0) }))} title="Kembalikan lebar semua kolom ke otomatis">Lebar otomatis</button>
        </div>
        <div className="tbl-group">
          <span className="tbl-label">Gabung</span>
          <button className={"btn small" + (pickMode ? " active" : "")} onClick={() => ((picked.current = false), setPickMode((v) => !v))} title="Mode pilih rentang sel: ketuk sel awal, lalu sel akhir (di komputer: klik sel lalu Shift+klik)">
            ⬚ Pilih rentang
          </button>
          <button className="btn small" disabled={!canMerge} onClick={() => (onChange((x) => mergeRect(x, R)), setSel({ kind: "cell", r: expandRect(t, R).r0, c: expandRect(t, R).c0 }))} title="Gabungkan sel terpilih">
            ⊞ Gabung
          </button>
          <button className="btn small" disabled={!canSplit} onClick={() => onChange((x) => splitRect(x, R))} title="Pisahkan sel gabungan">
            ⊟ Pisah
          </button>
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
          <span className="tbl-label">Gaya</span>
          <select className="small" value="" onChange={(e) => {
            const st = TABLE_STYLES.find((x) => x.id === e.target.value);
            if (st) set({ headBg: st.headBg, stripeBg: st.stripeBg, border: st.border, stripeMode: st.mode, stripe: st.mode !== "none" });
          }} title="Gaya tabel siap pakai">
            <option value="">Gaya tabel…</option>
            {TABLE_STYLES.map((x) => (
              <option key={x.id} value={x.id}>{x.name}</option>
            ))}
          </select>
          <select className="small" value={mode} onChange={(e) => set({ stripeMode: e.target.value as StripeMode, stripe: e.target.value !== "none" })} title="Warna belang-belang">
            <option value="none">Tanpa belang</option>
            <option value="rows">Baris belang</option>
            <option value="cols">Kolom belang</option>
            <option value="both">Papan catur</option>
          </select>
          {["#f1f5fb", "#dbeafe", "#d1fae5", "#fef3c7", "#ffedd5", "#fce7f3", "#ede9fe", "#e2e8f0"].map((h) => (
            <button key={h} className={"swatch" + ((t.stripeBg ?? "#f1f5fb") === h ? " on" : "")} style={{ background: h }} onClick={() => set({ stripeBg: h, ...(mode === "none" ? { stripeMode: "rows" as StripeMode, stripe: true } : {}) })} aria-label={"warna belang " + h} title="Warna belang" />
          ))}
        </div>
        <div className="tbl-group">
          <button className={"btn small" + (t.rtl ? " active" : "")} onClick={() => set({ rtl: !t.rtl })} title="Arah tabel: kolom pertama di kanan (Arab) atau di kiri">
            {t.rtl ? "⇠ Arab (kanan→kiri)" : "⇢ Latin (kiri→kanan)"}
          </button>
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
          <span className="tbl-label">{sel.kind === "cell" ? "Sel" : sel.kind === "row" ? "Baris" : sel.kind === "col" ? "Kolom" : sel.kind === "range" ? "Rentang" : "Semua"}</span>
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
      {pickMode && (
        <div className="tbl-hint small" style={{ background: "#eef2ff", color: "#3730a3" }}>
          Mode rentang: ketuk sel awal, lalu sel akhir. Setelah terpilih, tekan <b>⊞ Gabung</b>. (Komputer: klik sel, lalu Shift+klik sel lain.)
        </div>
      )}
      <div className="tbl-hint small muted" hidden={!tools}>
        Ketik langsung di sel · <kbd>Enter</kbd> turun · <kbd>Tab</kbd> ke sel berikut · <kbd>Shift</kbd>+<kbd>Enter</kbd> baris baru dalam sel · tempel (Ctrl+V) tabel dari Word/Excel akan mengisi banyak sel sekaligus · klik nomor baris/kolom untuk memilihnya.
      </div>
      <div className="tbl-scroll" ref={scrollEl}>
        <div className="tbl-canvas" style={{ width: (natW + 34) * zoom + 8, height: th * zoom + 100 }}>
          <table
            ref={tblEl}
            className="tbl"
            dir={t.rtl ? "rtl" : "ltr"}
            style={{ position: "absolute", top: 4, [t.rtl ? "right" : "left"]: 34 * zoom, width: natW, tableLayout: "fixed", transform: `scale(${zoom})`, transformOrigin: t.rtl ? "top right" : "top left" }}
          >
            <colgroup>
              <col style={{ width: 0 }} />
              {Array.from({ length: t.cols }, (_, c) => (
                <col key={c} style={{ width: `${(widths[c] / sumW) * 100}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="tbl-corner tbl-gut" onClick={() => setSel({ kind: "all", r: 0, c: 0 })} title="Pilih semua" />
                {Array.from({ length: t.cols }, (_, c) => (
                  <th key={c} ref={(el) => (thRefs.current[c] = el)} className={"tbl-h" + (sel.kind === "col" && sel.c === c ? " on" : "")} onClick={() => setSel({ kind: "col", r: 0, c })}>
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
                  {Array.from({ length: t.cols }, (_, c) => {
                    const key = keyOf(r, c);
                    if (covered.has(key)) return null;
                    const mg = anchors.get(key);
                    return (
                      <td key={c} rowSpan={mg?.rs} colSpan={mg?.cs} style={{ background: resolveCell(t, r, c).bg }} onPointerDown={(e) => e.target === e.currentTarget && !pickMode && (e.preventDefault(), focusCell(r, c))}>
                        <Cell
                          t={t}
                          r={r}
                          c={c}
                          tick={tick}
                          active={activeKeys.has(key) || (!!mg && cellsOf(sel, t).some(([a, b]) => a >= r && a < r + mg.rs && b >= c && b < c + mg.cs))}
                          pick={pickMode}
                          onPick={(shift) => pick(r, c, shift)}
                          onFocus={() => {
                            origin.current = { r, c };
                            setSel({ kind: "cell", r, c });
                          }}
                          onCommit={(v) => setCell(r, c, v)}
                          onKey={onKey(r, c)}
                          onPaste={onPaste(r, c)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="tbl-zoom">
        <button className="btn icon" onClick={() => userSetZoom(zoom * 1.2)} aria-label="Perbesar tabel">＋</button>
        <button className="btn icon" onClick={() => userSetZoom(zoom / 1.2)} aria-label="Perkecil tabel">−</button>
        <button className="btn icon" onClick={fitNow} aria-label="Pas layar" title="Pas layar (seluruh tabel terlihat)">⤢</button>
        <button className="btn icon" onClick={() => userSetZoom(1)} aria-label="Ukuran 100%" title="100%">1:1</button>
      </div>
    </div>
  );
}
