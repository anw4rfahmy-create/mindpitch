import { SH, SW, SlideInfo, drawSlide, drawTransition } from "./pitchRender";
import { Slide, stepsOf } from "./slides";
import { Theme } from "./themes";
import { Transition } from "./types";

export interface PitchCfg {
  transition: Transition;
  reveal: boolean;
  secondsPerSlide: number;
}

const ALL = 9999;
export const TRANS = 0.7;

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** Gambar bingkai pada waktu t (detik) dari linimasa otomatis. Dipakai pemutar otomatis dan ekspor video. */
export function frameAt(
  ctx: CanvasRenderingContext2D,
  slides: Slide[],
  theme: Theme,
  cfg: PitchCfg,
  t: number
) {
  const n = slides.length;
  const D = cfg.secondsPerSlide;
  const idx = clamp(Math.floor(t / D), 0, n - 1);
  const local = idx === n - 1 && t >= n * D ? D : t - idx * D;
  const slide = slides[idx];
  const steps = stepsOf(slide);
  const hasTrans = idx > 0 && cfg.transition !== "none";
  const start = hasTrans ? TRANS : 0.3;
  const stepDur = clamp((D - start - 1.0) / Math.max(steps, 1), 0.3, 1.1);
  const rv = cfg.reveal ? Math.max(0, (local - start) / stepDur) : ALL;
  const info: SlideInfo = { index: idx, total: n };
  if (hasTrans && local < TRANS) {
    const prevInfo: SlideInfo = { index: idx - 1, total: n };
    drawTransition(ctx, slides[idx - 1], slide, theme, cfg.transition, local / TRANS, ALL, cfg.reveal ? 0 : ALL, prevInfo, info);
  } else {
    drawSlide(ctx, slide, theme, rv, info);
  }
}

export const totalSeconds = (n: number, cfg: PitchCfg) => n * cfg.secondsPerSlide;

/** Pemutar interaktif: manual (klik/panah) atau otomatis (linimasa). */
export class Player {
  index = 0;
  step = 0;
  rv = 0;
  prevIndex: number | null = null;
  tp = 1;
  dir: 1 | -1 = 1;
  last = 0;
  auto = false;
  autoStart = 0;
  onAutoEnd?: () => void;

  constructor(public slides: Slide[], public theme: Theme, public cfg: PitchCfg) {}

  private steps(i = this.index) {
    return this.cfg.reveal ? stepsOf(this.slides[i]) : 0;
  }

  setSlides(slides: Slide[], theme: Theme, cfg: PitchCfg) {
    this.slides = slides;
    this.theme = theme;
    this.cfg = cfg;
    if (this.index >= slides.length) this.index = Math.max(0, slides.length - 1);
    this.step = Math.min(this.step, this.steps());
  }

  goto(i: number) {
    this.auto = false;
    this.index = clamp(i, 0, this.slides.length - 1);
    this.step = this.steps();
    this.rv = this.cfg.reveal ? this.step : ALL;
    this.prevIndex = null;
    this.tp = 1;
  }

  next(): boolean {
    this.auto = false;
    if (this.step < this.steps()) {
      this.step++;
      return true;
    }
    if (this.index < this.slides.length - 1) {
      this.prevIndex = this.index;
      this.index++;
      this.step = 0;
      this.rv = 0;
      this.dir = 1;
      this.tp = this.cfg.transition === "none" ? 1 : 0;
      return true;
    }
    return false;
  }

  prev(): boolean {
    this.auto = false;
    if (this.step > 0) {
      this.step--;
      return true;
    }
    if (this.index > 0) {
      this.prevIndex = this.index;
      this.index--;
      this.step = this.steps();
      this.rv = this.step;
      this.dir = -1;
      this.tp = this.cfg.transition === "none" ? 1 : 0;
      return true;
    }
    return false;
  }

  startAuto(now: number) {
    this.auto = true;
    this.prevIndex = null;
    this.tp = 1;
    this.autoStart = now - this.index * this.cfg.secondsPerSlide * 1000;
  }

  stopAuto() {
    this.auto = false;
  }

  /** Gambar satu bingkai. ctx sudah diberi skala ke 1280x720 oleh pemanggil. */
  render(ctx: CanvasRenderingContext2D, now: number) {
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    const n = this.slides.length;
    if (!n) return;

    if (this.auto) {
      const t = (now - this.autoStart) / 1000;
      if (t >= totalSeconds(n, this.cfg)) {
        this.auto = false;
        this.index = n - 1;
        this.step = this.steps();
        this.rv = this.cfg.reveal ? this.step : ALL;
        this.onAutoEnd?.();
      } else {
        this.index = clamp(Math.floor(t / this.cfg.secondsPerSlide), 0, n - 1);
        this.step = this.steps();
        frameAt(ctx, this.slides, this.theme, this.cfg, t);
        return;
      }
    }

    if (!this.cfg.reveal) this.rv = ALL;
    else if (this.rv < this.step) this.rv = Math.min(this.step, this.rv + dt / 0.5);
    else if (this.rv > this.step) this.rv = Math.max(this.step, this.rv - dt / 0.2);

    const info: SlideInfo = { index: this.index, total: n };
    if (this.prevIndex !== null && this.tp < 1) {
      this.tp = Math.min(1, this.tp + dt / 0.55);
      const pi = this.prevIndex;
      drawTransition(
        ctx,
        this.slides[pi],
        this.slides[this.index],
        this.theme,
        this.cfg.transition,
        this.tp,
        ALL,
        this.rv,
        { index: pi, total: n },
        info,
        this.dir
      );
      if (this.tp >= 1) this.prevIndex = null;
    } else {
      drawSlide(ctx, this.slides[this.index], this.theme, this.rv, info);
    }
  }
}

export { SW, SH };
