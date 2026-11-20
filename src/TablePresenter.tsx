import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ensureFonts, familyCss, isRtl } from "./fonts";
import { cellFontId, cellLineH, resolveCell } from "./table";
import { Sheet } from "./types";

type Mode = "row" | "col" | "cell" | "all";

export default function TablePresenter({ sheet, onClose }: { sheet: Sheet; onClose(): void }) {
  const t = sheet.table!;
  const [mode, setMode] = useState<Mode>("row");
  const [step, setStep] = useState(0);
  const [k, setK] = useState(1);
  const [, setTick] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const tbl = useRef<HTMLTableElement>(null);
  const bodyR = Math.max(0, t.rows - t.headRows),
    bodyC = Math.max(0, t.cols - t.headCols);
  const total = mode === "row" ? bodyR : mode === "col" ? bodyC : mode === "cell" ? bodyR * bodyC : 0;
  const shown = mode === "all" ? total : step;

  useEffect(() => {
    ensureFonts([t.font, t.arFont]).then(() => setTick((x) => x + 1));
  }, [t.font, t.arFont]);

  const next = useCallback(() => setStep((s) => Math.min(total, s + 1)), [total]);
  const prev = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " " || e.key === "Enter" || e.key === "PageDown") (e.preventDefault(), next());
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp" || e.key === "Backspace") (e.preventDefault(), prev());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onClose]);
  useEffect(() => setStep(0), [mode]);

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
    if (mode === "row") return br < shown;
    if (mode === "col") return bc < shown;
    return br * bodyC + bc < shown;
  };
  const latest = (r: number, c: number) => {
    if (r < t.headRows || c < t.headCols || mode === "all" || shown === 0) return false;
    const br = r - t.headRows,
      bc = c - t.headCols;
    if (mode === "row") return br === shown - 1;
    if (mode === "col") return bc === shown - 1;
    return br * bodyC + bc === shown - 1;
  };

  return (
    <div className="tbl-present" onClick={next}>
      <div className="tbl-stage" ref={box}>
        <table ref={tbl} className="tbl present" dir={t.rtl ? "rtl" : "ltr"} style={{ transform: `scale(${k})` }}>
          <colgroup>
            {Array.from({ length: t.cols }, (_, c) => (
              <col key={c} style={t.colW[c] > 0 ? { width: t.colW[c] } : { minWidth: 90 }} />
            ))}
          </colgroup>
          <tbody>
            {Array.from({ length: t.rows }, (_, r) => (
              <tr key={r}>
                {Array.from({ length: t.cols }, (_, c) => {
                  const txt = t.cells[r]?.[c] ?? "";
                  const res = resolveCell(t, r, c);
                  const rtl = isRtl(txt);
                  const vis = visible(r, c);
                  return (
                    <td
                      key={c}
                      style={{
                        background: latest(r, c) ? "#fff3b0" : res.bg,
                        color: vis ? (latest(r, c) ? "#0f172a" : res.color) : "transparent",
                        fontWeight: res.bold ? 700 : 400,
                        fontFamily: familyCss(cellFontId(t, txt)),
                        fontSize: res.size,
                        lineHeight: cellLineH(res.size, rtl) + "px",
                        textAlign: res.align === "c" ? "center" : res.align === "l" ? "left" : "right",
                        transition: "background .4s, color .25s",
                      }}
                    >
                      {txt.split("\n").map((l, i) => (
                        <div key={i} dir="auto">{l || " "}</div>
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="tbl-ctrl" onClick={(e) => e.stopPropagation()}>
        <button className="btn small" onClick={prev} disabled={step === 0 || mode === "all"}>◀</button>
        <span className="small">{mode === "all" ? "semua" : `${step} / ${total}`}</span>
        <button className="btn small" onClick={next} disabled={step >= total || mode === "all"}>▶</button>
        <span className="tbl-sep" />
        {(["row", "col", "cell", "all"] as Mode[]).map((m) => (
          <button key={m} className={"btn small" + (mode === m ? " active" : "")} onClick={() => setMode(m)}>
            {m === "row" ? "per baris" : m === "col" ? "per kolom" : m === "cell" ? "per sel" : "tampil semua"}
          </button>
        ))}
        <span className="tbl-sep" />
        <button className="btn small" onClick={onClose}>✕ Tutup</button>
      </div>
    </div>
  );
}
