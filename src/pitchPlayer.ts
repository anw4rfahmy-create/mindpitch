import { FrameOpts, drawFrame } from "./pitchRender";
import { Step } from "./pitchScenes";

export const TRANS_SEC = 0.85;

/** Pemutar langkah Pitch: mengatur indeks langkah, transisi, dan putar otomatis. */
export class Player {
  index = 0;
  private from: Step | null = null;
  private tStart = 0;
  private transitioning = false;
  auto = false;
  private autoAt = 0;
  onAutoEnd?: () => void;

  constructor(public steps: Step[], public opts: FrameOpts, public secondsPerStep: number) {}

  setData(steps: Step[], opts: FrameOpts, secondsPerStep: number) {
    this.steps = steps;
    this.opts = opts;
    this.secondsPerStep = secondsPerStep;
    if (this.index >= steps.length) this.index = Math.max(0, steps.length - 1);
  }

  goto(i: number, now = performance.now(), animate = true) {
    i = Math.max(0, Math.min(this.steps.length - 1, i));
    if (i === this.index) return;
    const prev = this.steps[this.index] ?? null;
    // hanya animasikan langkah bersebelahan; lompatan jauh langsung pindah
    this.from = animate && Math.abs(i - this.index) <= 1 ? prev : null;
    this.index = i;
    this.tStart = now;
    this.transitioning = !!this.from;
    this.autoAt = now + this.secondsPerStep * 1000;
  }
  next() {
    this.goto(this.index + 1);
  }
  prev() {
    this.goto(this.index - 1);
  }

  startAuto(now: number) {
    this.auto = true;
    this.autoAt = now + this.secondsPerStep * 1000;
  }
  stopAuto() {
    this.auto = false;
  }

  render(ctx: CanvasRenderingContext2D, now: number) {
    if (this.auto && now >= this.autoAt) {
      if (this.index >= this.steps.length - 1) {
        this.auto = false;
        this.onAutoEnd?.();
      } else this.goto(this.index + 1, now);
    }
    const cur = this.steps[this.index];
    if (!cur) return;
    let t = 1;
    if (this.transitioning) {
      t = (now - this.tStart) / 1000 / TRANS_SEC;
      if (t >= 1) {
        t = 1;
        this.transitioning = false;
      }
    }
    drawFrame(ctx, this.transitioning ? this.from : null, cur, t, this.opts);
  }
}
