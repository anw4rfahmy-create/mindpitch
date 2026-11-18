import { useEffect, useMemo, useRef, useState } from "react";
import Presenter from "./Presenter";
import { PitchCfg } from "./pitchPlayer";
import { SH, SW, drawSlide } from "./pitchRender";
import { Slide, buildSlides } from "./slides";
import { THEMES, themeById } from "./themes";
import { MapDoc, PitchSettings, SlideStyle, Transition } from "./types";
import { exportVideo, pickVideoMime } from "./videoExport";
import { download, safeName } from "./exporters";

interface Props {
  doc: MapDoc;
  apply(fn: (d: MapDoc) => MapDoc, history?: boolean): void;
  onClose(): void;
}

const ALL = 9999;

function Thumb({ slide, theme, index, total }: { slide: Slide; theme: ReturnType<typeof themeById>; index: number; total: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = el.getContext("2d")!;
    ctx.setTransform(el.width / SW, 0, 0, el.height / SH, 0, 0);
    drawSlide(ctx, slide, theme, ALL, { index, total });
  }, [slide, theme, index, total]);
  return <canvas ref={ref} width={256} height={144} className="thumb" />;
}

function Seg<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: [T, string][];
  onChange(v: T): void;
}) {
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

export default function PitchPanel({ doc, apply, onClose }: Props) {
  const p = doc.pitch;
  const theme = themeById(p.theme);
  const all = useMemo(() => buildSlides(doc, theme), [doc.nodes, doc.rootId, doc.pitch, theme]);
  const active = useMemo(() => all.filter((s) => !s.excluded), [all]);
  const cfg: PitchCfg = useMemo(
    () => ({ transition: p.transition, reveal: p.reveal, secondsPerSlide: p.secondsPerSlide }),
    [p.transition, p.reveal, p.secondsPerSlide]
  );

  const [selId, setSelId] = useState<string>(all[0]?.id ?? "");
  const sel = all.find((s) => s.id === selId) ?? all[0];
  const [present, setPresent] = useState<{ start: number; auto: boolean } | null>(null);
  const [exp, setExp] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);
  const prevRef = useRef<HTMLCanvasElement>(null);
  const canVideo = !!pickVideoMime();

  const set = (patch: Partial<PitchSettings>) =>
    apply((d) => ({ ...d, pitch: { ...d.pitch, ...patch } }), false);

  // pratinjau besar
  useEffect(() => {
    const el = prevRef.current;
    if (!el || !sel) return;
    const ctx = el.getContext("2d")!;
    ctx.setTransform(el.width / SW, 0, 0, el.height / SH, 0, 0);
    drawSlide(ctx, sel, theme, ALL, { index: Math.max(0, active.indexOf(sel)), total: Math.max(active.length, 1) });
  }, [sel, theme, active]);

  const toggleExclude = (s: Slide) => {
    if (s.kind === "cover") return;
    const parent = doc.nodes[s.id]?.parentId ?? "";
    const ex = new Set(p.excluded);
    if (ex.has(s.id) || ex.has(parent)) {
      ex.delete(s.id);
      ex.delete(parent);
    } else ex.add(s.id);
    set({ excluded: [...ex] });
  };

  const setSlideStyle = (v: SlideStyle | "") => {
    if (!sel || sel.kind === "cover") return;
    const o = { ...p.styleOverrides };
    if (v) o[sel.id] = v;
    else delete o[sel.id];
    set({ styleOverrides: o });
  };

  const runExport = async () => {
    const ac = new AbortController();
    abort.current = ac;
    setExp(0);
    try {
      const res = await exportVideo(active, theme, cfg, { onProgress: (x) => setExp(x), signal: ac.signal });
      download(res.blob, `${safeName(doc.title)}-pitch.${res.ext}`);
    } catch (e) {
      if ((e as Error).name !== "AbortError") alert((e as Error).message || "Gagal mengekspor video");
    } finally {
      setExp(null);
      abort.current = null;
    }
  };

  const startIdx = sel ? Math.max(0, active.indexOf(sel)) : 0;
  const totalSec = active.length * p.secondsPerSlide;

  return (
    <div className="overlay pitch">
      <div className="pitch-head">
        <h2>🎬 Pitch</h2>
        <span className="muted small">{active.length} slide · ±{totalSec} dtk</span>
        <div className="spacer" />
        <button className="btn primary" disabled={!active.length} onClick={() => setPresent({ start: startIdx, auto: false })}>
          ▶ Presentasikan
        </button>
        <button className="btn" disabled={!active.length} onClick={() => setPresent({ start: 0, auto: true })}>
          ⏵ Putar otomatis
        </button>
        <button className="btn icon" onClick={onClose} aria-label="Tutup">
          ✕
        </button>
      </div>

      <div className="pitch-body">
        <aside className="pitch-list">
          {all.map((s, i) => {
            const n = active.indexOf(s);
            return (
              <div
                key={s.id}
                className={"slide-row" + (s.id === sel?.id ? " sel" : "") + (s.excluded ? " off" : "")}
                onClick={() => setSelId(s.id)}
              >
                <Thumb slide={s} theme={theme} index={Math.max(n, 0)} total={Math.max(active.length, 1)} />
                <div className="slide-meta">
                  <span className="slide-no">{i + 1}</span>
                  <span className="slide-title">{s.title}</span>
                </div>
                {s.kind !== "cover" && (
                  <button
                    className="eye"
                    title={s.excluded ? "Sertakan slide" : "Sembunyikan slide"}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExclude(s);
                    }}
                  >
                    {s.excluded ? "🚫" : "👁"}
                  </button>
                )}
              </div>
            );
          })}
          {!all.length && <p className="muted small pad">Tambahkan cabang pada peta untuk membuat slide.</p>}
        </aside>

        <main className="pitch-preview">
          <canvas ref={prevRef} width={1280} height={720} className="preview-canvas" />
          {sel?.note && (
            <div className="note-box">
              <b>Catatan pembicara</b>
              <p>{sel.note}</p>
            </div>
          )}
        </main>

        <aside className="pitch-settings">
          <label className="field">
            <span>Tema</span>
            <div className="themes">
              {THEMES.map((t) => (
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
          </label>

          <div className="field">
            <span>Struktur slide</span>
            <Seg<1 | 2>
              value={p.depth}
              options={[
                [1, "Per cabang utama"],
                [2, "Hingga sub-cabang"],
              ]}
              onChange={(v) => set({ depth: v })}
            />
          </div>

          <div className="field">
            <span>Gaya isi</span>
            <Seg<SlideStyle>
              value={p.style}
              options={[
                ["bullets", "Poin"],
                ["cards", "Kartu"],
                ["map", "Peta"],
              ]}
              onChange={(v) => set({ style: v })}
            />
            {sel && sel.kind !== "cover" && (
              <select
                className="select"
                value={p.styleOverrides[sel.id] ?? ""}
                onChange={(e) => setSlideStyle(e.target.value as SlideStyle | "")}
              >
                <option value="">Slide terpilih: ikuti gaya umum</option>
                <option value="bullets">Slide terpilih: Poin</option>
                <option value="cards">Slide terpilih: Kartu</option>
                <option value="map">Slide terpilih: Peta</option>
              </select>
            )}
          </div>

          <div className="field">
            <span>Transisi</span>
            <Seg<Transition>
              value={p.transition}
              options={[
                ["fade", "Pudar"],
                ["slide", "Geser"],
                ["none", "Tanpa"],
              ]}
              onChange={(v) => set({ transition: v })}
            />
          </div>

          <label className="check">
            <input type="checkbox" checked={p.reveal} onChange={(e) => set({ reveal: e.target.checked })} />
            Tampilkan poin satu per satu
          </label>
          <label className="check">
            <input type="checkbox" checked={p.cover} onChange={(e) => set({ cover: e.target.checked })} />
            Sertakan slide sampul
          </label>

          <label className="field">
            <span>Durasi per slide: {p.secondsPerSlide} detik</span>
            <input
              type="range"
              min={3}
              max={20}
              step={1}
              value={p.secondsPerSlide}
              onChange={(e) => set({ secondsPerSlide: +e.target.value })}
            />
          </label>

          <div className="field">
            <span>Ekspor</span>
            {exp === null ? (
              <button className="btn block" disabled={!canVideo || !active.length} onClick={runExport}>
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
            <p className="muted small">
              Video direkam real-time sesuai durasi ({totalSec} dtk). Biarkan tab ini tetap terbuka dan terlihat sampai selesai.
            </p>
          </div>
        </aside>
      </div>

      {present && (
        <Presenter
          slides={active}
          theme={theme}
          cfg={cfg}
          startIndex={present.start}
          autoplay={present.auto}
          onClose={() => setPresent(null)}
        />
      )}
    </div>
  );
}
