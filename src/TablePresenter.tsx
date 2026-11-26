import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ensureFonts, familyCss, isRtl } from "./fonts";
import { cellFontId, cellLineH, mergeMaps, resolveCell } from "./table";
import { Sheet } from "./types";

type Mode = "row" | "col" | "cell" | "down" | "tap" | "all";

export default function TablePresenter({ sheet, onClose, onAttach }: { sheet: Sheet; onClose(): void; onAttach?(r: number, c: number): void }) {
  const t = sheet.table!;
  const [mode, setMode] = useState<Mode>("row");
  const [step, setStep] = useState(0);
  const [k, setK] = useState(1);
  const [taps, setTaps] = useState<Set<string>>(new Set());
  const [lastTap, setLastTap] = useState("");
  const [, setTick] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const tbl = useRef<HTMLTableElement>(null);
  const { anchors, covered } = mergeMaps(t);
  const bodyR = Math.max(0, t.rows - t.headRows),
    bodyC = Math.max(0, t.cols - t.headCols);
  const total = mode === "row" ? bodyR : mode === "col" ? bodyC : mode === "cell" || mode === "down" || mode === "tap" ? bodyR * bodyC : 0;
  const shown = mode === "all" ? total : mode === "tap" ? taps.size : step;

  useEffect(() => {
    ensureFonts([t.font, t.arFont]).then(() => setTick((x) => x + 1));
  }, [t.font, t.arFont]);

  const next = useCallback(() => mode !== "tap" && setStep((s) => Math.min(total, s + 1)), [total, mode]);
  const prev = useCallback(() => mode !== "tap" && setStep((s) => Math.max(0, s - 1)), [mode]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " " || e.key === "Enter" || e.key === "PageDown") (e.preventDefault(), next());
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp" || e.key === "Backspace") (e.preventDefault(), prev());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onClose]);
  useEffect(() => {
    setStep(0);
    setTaps(new Set());
    setLastTap("");
  }, [mode]);

  const fit = useCallback(() => {
    const b = box.current,
      tb = tbl.current;
    if (!b || !tb) return;
    const w = tb.offsetWidth,
      h = tb.offsetHeight;
    setK(Math.max(0.2, Math.min((b.clientWidth - 40) / w, (b.clientHeight - 30) / h, 2.4)));
  }, []);
  useLayoutEffect(() => {
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [fit, t, step]);

  const visible = (r: number, c: number) => {
    if (r < t.headRows || c < t.headCols || mode === "all") return true;
    const br = r - t.headRows,
      bc = c - t.headCols;
    if (mode === "tap") return taps.has(`${r},${c}`);
    if (mode === "row") return br < shown;
    if (mode === "col") return bc < shown;
    if (mode === "down") return bc * bodyR + br < shown;
    return br * bodyC + bc < shown;
  };
  const latest = (r: number, c: number) => {
    if (r < t.headRows || c < t.headCols || mode === "all" || shown === 0) return false;
    const br = r - t.headRows,
      bc = c - t.headCols;
    if (mode === "tap") return lastTap === `${r},${c}`;
    if (mode === "row") return br === shown - 1;
    if (mode === "col") return bc === shown - 1;
    if (mode === "down") return bc * bodyR + br === shown - 1;
    return br * bodyC + bc === shown - 1;
  };

  return (
    <div className="tbl-present" onClick={next}>
      <div className="tbl-stage" ref={box}>
        <table ref={tbl} className="tbl present" dir={t.rtl ? "rtl" : "ltr"} style={{ transform: `scale(${k})`, ...(t.colW.every((w) => w > 0) ? { tableLayout: "fixed", width: t.colW.reduce((a, b) => a + b, 0) } : {}) }}>
          <colgroup>
            {Array.from({ length: t.cols }, (_, c) => (
              <col key={c} style={t.colW[c] > 0 ? { width: t.colW[c] } : { minWidth: 90 }} />
            ))}
          </colgroup>
          <tbody>
            {Array.from({ length: t.rows }, (_, r) => (
              <tr key={r}>
                {Array.from({ length: t.cols }, (_, c) => {
                  if (covered.has(`${r},${c}`)) return null;
                  const mg = anchors.get(`${r},${c}`);
                  const txt = t.cells[r]?.[c] ?? "";
                  const res = resolveCell(t, r, c);
                  const rtl = isRtl(txt);
                  const vis = visible(r, c);
                  return (
                    <td
                      key={c}
                      rowSpan={mg?.rs}
                      colSpan={mg?.cs}
                      onClick={(e) => {
                        if (mode !== "tap" || r < t.headRows || c < t.headCols) return;
                        e.stopPropagation();
                        const key = `${r},${c}`;
                        setTaps((s) => {
                          const n = new Set(s);
                          if (n.has(key)) n.delete(key);
                          else n.add(key);
                          return n;
                        });
                        setLastTap(key);
                      }}
                      style={{
                        cursor: mode === "tap" && r >= t.headRows && c >= t.headCols ? "pointer" : undefined,
                        background: latest(r, c) ? "#fff3b0" : res.bg,
                        color: vis ? (latest(r, c) ? "#0f172a" : res.color) : "transparent",
                        fontWeight: res.bold ? 700 : 400,
                        fontFamily: familyCss(cellFontId(t, txt)),
                        fontSize: res.size,
                        lineHeight: cellLineH(res.size, rtl) + "px",
                        textAlign: res.align === "c" ? "center" : res.align === "l" ? "left" : "right",
                        transition: "background .4s, color .25s",
                        position: "relative",
                      }}
                    >
                      {res.diag && (
                        <svg className="diag" viewBox="0 0 100 100" preserveAspectRatio="none">
                          {res.diag !== "up" && <line x1="0" y1="0" x2="100" y2="100" />}
                          {res.diag !== "down" && <line x1="0" y1="100" x2="100" y2="0" />}
                        </svg>
                      )}
                      {vis && (t.style[`${r},${c}`]?.att?.length ?? 0) > 0 && (
                        <button
                          className="cell-clip"
                          aria-label="Buka lampiran sel"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAttach?.(r, c);
                          }}
                        >
                          📎{t.style[`${r},${c}`]!.att!.length > 1 ? t.style[`${r},${c}`]!.att!.length : ""}
                        </button>
                      )}
                      {res.diag === "down" || res.diag === "up" ? (
                        <div className="dg-box" style={{ height: cellLineH(res.size, rtl) * 2 + 18 }}>
                          <div className={"dg-lab main " + res.diag} dir="auto">{txt}</div>
                          <div className={"dg-lab sub " + res.diag} dir="auto">{res.sub ?? ""}</div>
                        </div>
                      ) : (
                        txt.split("\n").map((l, i) => (
                          <div key={i} dir="auto">{l || "\u00a0"}</div>
                        ))
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="tbl-ctrl" onClick={(e) => e.stopPropagation()}>
        {mode === "tap" ? (
          <>
            <span className="small">{taps.size} / {total} · ketuk sel untuk memunculkan</span>
            <button className="btn small" onClick={() => setTaps(new Set())}>Sembunyikan</button>
            <button className="btn small" onClick={() => setTaps(new Set(Array.from({ length: t.rows * t.cols }, (_, i) => [Math.floor(i / t.cols), i % t.cols]).filter(([r, c]) => r >= t.headRows && c >= t.headCols).map(([r, c]) => `${r},${c}`)))}>Munculkan semua</button>
          </>
        ) : (
          <>
            <button className="btn small" onClick={prev} disabled={step === 0 || mode === "all"}>◀</button>
            <span className="small">{mode === "all" ? "semua" : `${step} / ${total}`}</span>
            <button className="btn small" onClick={next} disabled={step >= total || mode === "all"}>▶</button>
          </>
        )}
        <span className="tbl-sep" />
        {(["row", "col", "cell", "down", "tap", "all"] as Mode[]).map((m) => (
          <button key={m} className={"btn small" + (mode === m ? " active" : "")} onClick={() => setMode(m)}>
            {m === "row" ? "per baris" : m === "col" ? "per kolom" : m === "cell" ? "per sel →" : m === "down" ? "per sel ↓" : m === "tap" ? "ketuk sel" : "tampil semua"}
          </button>
        ))}
        <span className="tbl-sep" />
        <button className="btn small" onClick={onClose}>✕ Tutup</button>
      </div>
    </div>
  );
}
