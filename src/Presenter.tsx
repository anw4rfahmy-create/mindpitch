import { useCallback, useEffect, useRef, useState } from "react";
import { Player } from "./pitchPlayer";
import { FrameOpts, SH, SW } from "./pitchRender";
import { Step } from "./pitchScenes";

interface Props {
  slides: Step[];
  opts: FrameOpts;
  perStep: number;
  startIndex?: number;
  autoplay?: boolean;
  onClose(): void;
  attCount?(nodeId: string): number;
  onAttach?(nodeId: string): void;
}

export default function Presenter({ slides, opts, perStep, startIndex = 0, autoplay, onClose, attCount, onAttach }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const player = useRef<Player | null>(null);
  const [index, setIndex] = useState(startIndex);
  const [auto, setAuto] = useState(!!autoplay);
  const [notes, setNotes] = useState(false);
  const [ui, setUi] = useState(true);
  const hideTimer = useRef<number>();
  const enteredFs = useRef(false);
  const swipe = useRef<{ x: number; y: number } | null>(null);

  if (!player.current) {
    const p = new Player(slides, opts, perStep);
    p.index = Math.min(startIndex, slides.length - 1);
    player.current = p;
  }

  // ukuran kanvas 16:9 menyesuaikan jendela
  const resize = useCallback(() => {
    const el = cv.current,
      b = box.current;
    if (!el || !b) return;
    const w = b.clientWidth,
      h = b.clientHeight;
    const scale = Math.min(w / SW, h / SH);
    const cw = Math.floor(SW * scale),
      ch = Math.floor(SH * scale);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.style.width = cw + "px";
    el.style.height = ch + "px";
    el.width = Math.floor(cw * dpr);
    el.height = Math.floor(ch * dpr);
  }, []);

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  // perbarui data bila berubah
  useEffect(() => {
    player.current!.setData(slides, opts, perStep);
  }, [slides, opts, perStep]);

  // putar otomatis
  useEffect(() => {
    const p = player.current!;
    p.onAutoEnd = () => setAuto(false);
    if (auto && !p.auto) p.startAuto(performance.now());
    if (!auto && p.auto) p.stopAuto();
  }, [auto]);

  // loop render
  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => {
      const el = cv.current;
      const p = player.current!;
      if (el) {
        const ctx = el.getContext("2d")!;
        ctx.setTransform(el.width / SW, 0, 0, el.height / SH, 0, 0);
        p.render(ctx, now);
        setIndex((cur) => (cur === p.index ? cur : p.index));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const next = useCallback(() => {
    player.current!.next();
    setAuto(false);
  }, []);
  const prev = useCallback(() => {
    player.current!.prev();
    setAuto(false);
  }, []);

  // layar penuh
  useEffect(() => {
    const el = box.current;
    if (el?.requestFullscreen) {
      el.requestFullscreen()
        .then(() => (enteredFs.current = true))
        .catch(() => {});
    }
    const onFs = () => {
      if (!document.fullscreenElement && enteredFs.current) onClose();
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      enteredFs.current = false;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // papan ketik
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector(".attach-modal")) return;
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
        case "PageDown":
        case " ":
        case "Enter":
          e.preventDefault();
          next();
          break;
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp":
        case "Backspace":
          e.preventDefault();
          prev();
          break;
        case "Home":
          player.current!.goto(0, performance.now(), false);
          setAuto(false);
          break;
        case "End":
          player.current!.goto(slides.length - 1, performance.now(), false);
          setAuto(false);
          break;
        case "Escape":
          onClose();
          break;
        case "a":
        case "A":
          setAuto((v) => !v);
          break;
        case "n":
        case "N":
          setNotes((v) => !v);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onClose, slides.length]);

  const poke = () => {
    setUi(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setUi(false), 2600);
  };
  useEffect(() => {
    poke();
    return () => window.clearTimeout(hideTimer.current);
  }, []);

  const onDown = (e: React.PointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onUp = (e: React.PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x,
      dy = e.clientY - s.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      dx < 0 ? next() : prev();
      return;
    }
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      (e.clientX - r.left) / r.width < 0.25 ? prev() : next();
    }
  };

  const cur = slides[index];
  return (
    <div
      ref={box}
      className="presenter"
      onPointerMove={poke}
      onPointerDown={onDown}
      onPointerUp={onUp}
      style={{ cursor: ui ? "default" : "none" }}
    >
      <canvas ref={cv} />
      <div className={"presenter-bar" + (ui ? " show" : "")} onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
        <span className="presenter-count">
          {index + 1} / {slides.length}
        </span>
        <button className="pbtn" onClick={() => setAuto((v) => !v)} title="Putar otomatis (A)">
          {auto ? "⏸ Jeda" : "▶ Otomatis"}
        </button>
        {onAttach && cur && (attCount?.(cur.nodeId) ?? 0) > 0 && (
          <button className="pbtn" onClick={() => (setAuto(false), onAttach(cur.nodeId))} title="Buka lampiran topik ini">
            📎 Lampiran ({attCount!(cur.nodeId)})
          </button>
        )}
        <button className="pbtn" onClick={() => setNotes((v) => !v)} title="Catatan (N)">
          📝 Catatan
        </button>
        <button className="pbtn" onClick={onClose} title="Tutup (Esc)">
          ✕ Tutup
        </button>
      </div>
      {notes && cur?.note && <div className="presenter-notes">{cur.note}</div>}
    </div>
  );
}
