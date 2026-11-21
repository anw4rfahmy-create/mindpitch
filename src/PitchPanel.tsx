import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Presenter from "./Presenter";
import { SH, SW, FrameOpts, drawStatic } from "./pitchRender";
import { buildSteps } from "./pitchScenes";
import { PITCH_THEMES, pitchThemeById } from "./themes";
import { PitchSettings, Sheet, SlideTransition, Workbook } from "./types";
import { exportVideo, pickVideoMime, videoSeconds } from "./videoExport";
import { download, safeName } from "./exporters";
import { ensureFonts } from "./fonts";
import { filesVersion, loadImage, imageSync, prepareImage, putFile, subscribeFiles } from "./files";

interface Props {
  wb: Workbook;
  sheet: Sheet;
  startId: string | null;
  applySheet(fn: (s: Sheet) => Sheet, history?: boolean): void;
  onClose(): void;
}

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange(v: T): void }) {
  return (
    <div className="seg">
      {options.map(([v, label]) => (
        <button key={String(v)} className={v === value ? "on" : ""} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export default function PitchPanel({ wb, sheet, startId, applySheet, onClose }: Props) {
  const p = sheet.pitch;
  const theme = pitchThemeById(p.theme);
  useSyncExternalStore(subscribeFiles, filesVersion);
  const [from, setFrom] = useState<"root" | "sel">(startId && startId !== sheet.rootId ? "sel" : "root");
  const [ready, setReady] = useState(0);
  const [idx, setIdx] = useState(0);
  const [present, setPresent] = useState<{ start: number; auto: boolean } | null>(null);
  const [exp, setExp] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);
  const prevRef = useRef<HTMLCanvasElement>(null);
  const bgInput = useRef<HTMLInputElement>(null);
  const canVideo = !!pickVideoMime();

  // muat font & gambar yang dibutuhkan
  useEffect(() => {
    const ids = new Set<string>([sheet.font]);
    const files = new Set<string>();
    for (const id in sheet.nodes) {
      if (sheet.nodes[id].font) ids.add(sheet.nodes[id].font!);
      if (sheet.nodes[id].image) files.add(sheet.nodes[id].image!.fileId);
    }
    if (p.bgImageId) files.add(p.bgImageId);
    Promise.all([ensureFonts([...ids]), ...[...files].map((f) => loadImage(f))]).then(() => setReady((n) => n + 1));
  }, [sheet.font, sheet.nodes, p.bgImageId]);

  const startNode = from === "sel" && startId && sheet.nodes[startId] ? startId : sheet.rootId;
  const steps = useMemo(
    () => buildSteps(sheet, { startId: startNode, focus: p.focus, textScale: p.textScale }),
    [sheet, startNode, p.focus, p.textScale, ready] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const opts: FrameOpts = useMemo(
    () => ({ theme, bgImage: imageSync(p.bgImageId), bgDim: p.bgDim, transition: p.transition }),
    [theme, p.bgImageId, p.bgDim, p.transition, ready, filesVersion()] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const cur = Math.min(idx, Math.max(0, steps.length - 1));

  useEffect(() => {
    const el = prevRef.current;
    if (!el || !steps[cur]) return;
    const ctx = el.getContext("2d")!;
    ctx.setTransform(el.width / SW, 0, 0, el.height / SH, 0, 0);
    drawStatic(ctx, steps[cur], opts);
  }, [steps, cur, opts]);

  const set = (patch: Partial<PitchSettings>) => applySheet((s) => ({ ...s, pitch: { ...s.pitch, ...patch } }), false);

  // topik utama yang bisa disertakan/dikeluarkan
  const rows: { id: string; depth: number }[] = [];
  const walk = (id: string, d: number) => {
    if (d > 2) return;
    rows.push({ id, depth: d });
    sheet.nodes[id].children.forEach((c) => sheet.nodes[c] && sheet.nodes[c].children.length + d >= 0 && walk(c, d + 1));
  };
  walk(sheet.rootId, 0);
  const toggleEx = (id: string) => {
    const ex = new Set(p.excluded);
    ex.has(id) ? ex.delete(id) : ex.add(id);
    set({ excluded: [...ex] });
  };

  const runExport = async () => {
    const ac = new AbortController();
    abort.current = ac;
    setExp(0);
    try {
      const res = await exportVideo(steps, opts, p.secondsPerStep, { onProgress: setExp, signal: ac.signal });
      download(res.blob, `${safeName(wb.title + "-" + sheet.title)}-presentasi.${res.ext}`);
    } catch (e) {
      if ((e as Error).name !== "AbortError") alert((e as Error).message || "Gagal mengekspor video");
    } finally {
      setExp(null);
      abort.current = null;
    }
  };

  const pickBg = async (f?: File) => {
    if (!f) return;
    try {
      const { blob } = await prepareImage(f, 1920);
      const id = await putFile(wb.id, blob, f.name, blob.type);
      set({ bgImageId: id });
    } catch {
      alert("Gagal memuat gambar");
    }
  };

  const totalSec = Math.round(videoSeconds(steps.length, p.secondsPerStep));

  return (
    <div className="overlay pitch">
      <div className="pitch-head">
        <h2>🎬 Presentasi</h2>
        <span className="muted small">
          {steps.length} langkah · ±{totalSec} dtk
        </span>
        <div className="spacer" />
        <button className="btn primary" disabled={!steps.length} onClick={() => setPresent({ start: 0, auto: false })}>
          ▶ Presentasikan
        </button>
        <button className="btn" disabled={!steps.length} onClick={() => setPresent({ start: 0, auto: true })}>
          ⏵ Putar otomatis
        </button>
        <button className="btn icon" onClick={onClose} aria-label="Tutup">
          ✕
        </button>
      </div>

      <div className="pitch-body">
        <aside className="pitch-list">
          <div className="field pad">
            <span>Mulai dari</span>
            <Seg<"root" | "sel">
              value={from}
              options={[
                ["root", "Topik pusat"],
                ["sel", "Topik terpilih"],
              ]}
              onChange={setFrom}
            />
            {from === "sel" && startNode !== sheet.rootId && <small className="muted">“{sheet.nodes[startNode].text.split("\n")[0].slice(0, 30)}”</small>}
          </div>
          <div className="pad small muted" style={{ paddingTop: 0 }}>
            Sertakan / sembunyikan topik:
          </div>
          {rows.map(({ id, depth }) => (
            <label key={id} className="ex-row" style={{ paddingLeft: 12 + depth * 16 }}>
              <input type="checkbox" checked={!p.excluded.includes(id)} disabled={id === sheet.rootId} onChange={() => toggleEx(id)} />
              <span>{sheet.nodes[id].text.split("\n")[0].slice(0, 34)}</span>
            </label>
          ))}
        </aside>

        <main className="pitch-preview">
          <canvas ref={prevRef} width={1280} height={720} className="preview-canvas" />
          <div className="step-nav">
            <button className="btn small" disabled={cur <= 0} onClick={() => setIdx(cur - 1)}>
              ◀
            </button>
            <input type="range" min={0} max={Math.max(0, steps.length - 1)} value={cur} onChange={(e) => setIdx(+e.target.value)} />
            <button className="btn small" disabled={cur >= steps.length - 1} onClick={() => setIdx(cur + 1)}>
              ▶
            </button>
            <span className="small muted">
              {cur + 1} / {steps.length}
            </span>
            <button className="btn small" onClick={() => setPresent({ start: cur, auto: false })}>
              Putar dari sini
            </button>
          </div>
          {steps[cur]?.note && (
            <div className="note-box">
              <b>Catatan pembicara</b>
              <p>{steps[cur].note}</p>
            </div>
          )}
        </main>

        <aside className="pitch-settings">
          <div className="field">
            <span>Tema</span>
            <div className="themes">
              {PITCH_THEMES.map((t) => (
                <button
                  key={t.id}
                  className={"theme-chip" + (t.id === p.theme ? " on" : "")}
                  style={{ background: `linear-gradient(135deg, ${t.bg[0]}, ${t.bg[1]})`, color: t.fg }}
                  onClick={() => set({ theme: t.id })}
                >
                  <i style={{ background: t.accent }} />
                  {t.name}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>Gambar latar presentasi</span>
            <div className="seg wrap">
              <button onClick={() => bgInput.current?.click()}>{p.bgImageId ? "Ganti gambar" : "＋ Gambar latar"}</button>
              {p.bgImageId && <button onClick={() => set({ bgImageId: undefined })}>Hapus</button>}
            </div>
            {p.bgImageId && (
              <label className="check">
                Gelapkan
                <input type="range" min={0} max={0.8} step={0.05} value={p.bgDim} onChange={(e) => set({ bgDim: +e.target.value })} />
              </label>
            )}
            <input ref={bgInput} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; pickBg(f); }} />
          </div>
          <label className="check">
            <input type="checkbox" checked={p.focus} onChange={(e) => set({ focus: e.target.checked })} />
            Mulai dengan judul di tengah layar
          </label>
          <div className="field">
            <span>Transisi</span>
            <Seg<SlideTransition>
              value={p.transition}
              options={[
                ["fade", "Bergerak"],
                ["none", "Tanpa"],
              ]}
              onChange={(v) => set({ transition: v })}
            />
          </div>
          <label className="field">
            <span>Ukuran teks: {Math.round(p.textScale * 100)}%</span>
            <input type="range" min={0.7} max={1.4} step={0.05} value={p.textScale} onChange={(e) => set({ textScale: +e.target.value })} />
          </label>
          <label className="field">
            <span>Durasi per langkah: {p.secondsPerStep} detik</span>
            <input type="range" min={2} max={15} step={1} value={p.secondsPerStep} onChange={(e) => set({ secondsPerStep: +e.target.value })} />
          </label>
          <div className="field">
            <span>Ekspor video</span>
            {exp === null ? (
              <button className="btn block" disabled={!canVideo || !steps.length} onClick={runExport}>
                ⬇ Ekspor video ({canVideo ? "MP4/WebM" : "tidak didukung"})
              </button>
            ) : (
              <div className="progress-box">
                <div className="bar">
                  <i style={{ width: `${Math.round(exp * 100)}%` }} />
                </div>
                <div className="row">
                  <span className="small">Merekam… {Math.round(exp * 100)}%</span>
                  <button className="btn small" onClick={() => abort.current?.abort()}>
                    Batal
                  </button>
                </div>
              </div>
            )}
            <p className="muted small">Direkam real-time ({totalSec} dtk), tanpa suara. Biarkan tab tetap terbuka sampai selesai.</p>
          </div>
        </aside>
      </div>

      {present && <Presenter slides={steps} opts={opts} perStep={p.secondsPerStep} startIndex={present.start} autoplay={present.auto} onClose={() => setPresent(null)} />}
    </div>
  );
}
