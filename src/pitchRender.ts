import { fontString } from "./fonts";
import { bracePath } from "./layout";
import { imageSync } from "./files";
import { PitchTheme } from "./themes";
import { BraceItem, BulletItem, ImageItem, Item, SH, SW, Step, TextItem } from "./pitchScenes";

export { SW, SH };

export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const LH = 1.32;

const lineH = (it: TextItem) => it.size * (it.rtl ? LH + 0.18 : LH);

function blockW(ctx: CanvasRenderingContext2D, it: TextItem): number {
  ctx.font = fontString(it.font, it.weight, it.size, false);
  let w = 0;
  for (const l of it.lines) w = Math.max(w, ctx.measureText(l).width);
  return w;
}

function centerX(ctx: CanvasRenderingContext2D, it: TextItem): number {
  const w = blockW(ctx, it);
  return it.align === "left" ? it.ax + w / 2 : it.align === "right" ? it.ax - w / 2 : it.ax;
}

export interface FrameOpts {
  theme: PitchTheme;
  bgImage?: HTMLImageElement | null;
  bgDim: number;
  transition: "fade" | "slide" | "none";
}

export function drawBackground(ctx: CanvasRenderingContext2D, o: FrameOpts) {
  const g = ctx.createLinearGradient(0, 0, SW * 0.35, SH);
  g.addColorStop(0, o.theme.bg[0]);
  g.addColorStop(1, o.theme.bg[1]);
  ctx.globalAlpha = 1;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SW, SH);
  const im = o.bgImage;
  if (im && im.naturalWidth) {
    const k = Math.max(SW / im.naturalWidth, SH / im.naturalHeight);
    const w = im.naturalWidth * k,
      h = im.naturalHeight * k;
    ctx.drawImage(im, (SW - w) / 2, (SH - h) / 2, w, h);
    if (o.bgDim > 0) {
      ctx.fillStyle = `rgba(${o.theme.fg === "#ffffff" ? "5,10,40" : "255,255,255"},${o.bgDim})`;
      ctx.fillRect(0, 0, SW, SH);
    }
  }
}

function drawText(ctx: CanvasRenderingContext2D, it: TextItem, theme: PitchTheme, cx: number, cy: number, size: number, alpha: number) {
  if (alpha <= 0.01) return;
  const t = { ...it, size };
  const w = blockW(ctx, t);
  const lh = lineH(t);
  const h = lh * t.lines.length;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = fontString(it.font, it.weight, size, false);
  ctx.fillStyle = it.role === "muted" ? theme.muted : theme.fg;
  ctx.strokeStyle = ctx.fillStyle;
  ctx.textBaseline = "middle";
  ctx.direction = it.rtl ? "rtl" : "ltr";
  const x = it.align === "left" ? cx - w / 2 : it.align === "right" ? cx + w / 2 : cx;
  ctx.textAlign = it.align;
  t.lines.forEach((l, i) => {
    const y = cy - h / 2 + lh * (i + 0.5);
    ctx.fillText(l, x, y);
    if (it.underline) {
      const lw = ctx.measureText(l).width;
      const x0 = it.align === "left" ? x : it.align === "right" ? x - lw : x - lw / 2;
      ctx.lineWidth = Math.max(1.5, size / 14);
      ctx.beginPath();
      ctx.moveTo(x0, y + size * 0.62);
      ctx.lineTo(x0 + lw, y + size * 0.62);
      ctx.stroke();
    }
  });
  ctx.restore();
}

function drawBrace(ctx: CanvasRenderingContext2D, b: BraceItem, theme: PitchTheme, alpha: number) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = theme.fg;
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke(new Path2D(bracePath(b.x, b.y1, b.y2, b.ym, b.dir)));
  ctx.restore();
}

function drawBullet(ctx: CanvasRenderingContext2D, b: BulletItem, theme: PitchTheme, alpha: number, flip: boolean) {
  if (alpha <= 0.01) return;
  const s = b.size;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = theme.fg;
  ctx.beginPath();
  const d = flip ? -1 : 1;
  ctx.moveTo(b.x - (d * s) / 2, b.cy - s / 2);
  ctx.lineTo(b.x + (d * s) / 2, b.cy);
  ctx.lineTo(b.x - (d * s) / 2, b.cy + s / 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawImageItem(ctx: CanvasRenderingContext2D, im: ImageItem, alpha: number) {
  const img = imageSync(im.fileId);
  if (!img || alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.roundRect(im.cx - im.w / 2, im.cy - im.h / 2, im.w, im.h, 12);
  ctx.clip();
  ctx.drawImage(img, im.cx - im.w / 2, im.cy - im.h / 2, im.w, im.h);
  ctx.restore();
}

/** Gambar satu bingkai: interpolasi dari langkah a ke b pada kemajuan t (0..1). */
export function drawFrame(ctx: CanvasRenderingContext2D, a: Step | null, b: Step, t: number, o: FrameOpts) {
  drawBackground(ctx, o);
  const e = o.transition === "none" ? 1 : ease(Math.min(1, Math.max(0, t)));
  const am = new Map<string, Item>();
  a?.items.forEach((i) => am.set(i.key, i));
  const bm = new Map<string, Item>();
  b.items.forEach((i) => bm.set(i.key, i));
  const done = !a || e >= 1;
  const fadeIn = done ? 1 : Math.max(0, (e - 0.3) / 0.7);
  const fadeOut = done ? 0 : Math.max(0, 1 - e / 0.45);

  // yang hilang
  if (!done)
    for (const [k, it] of am) {
      if (bm.has(k)) continue;
      drawItem(ctx, it, it, 0, o, fadeOut * (it.alpha ?? 1));
    }
  for (const [k, it] of bm) {
    const prev = am.get(k);
    if (prev && !done) drawItem(ctx, prev, it, e, o, 1);
    else drawItem(ctx, it, it, 1, o, fadeIn);
  }
}

function drawItem(ctx: CanvasRenderingContext2D, from: Item, to: Item, e: number, o: FrameOpts, alpha: number) {
  if (to.kind === "text" && from.kind === "text") {
    const cx = lerp(centerX(ctx, from), centerX(ctx, to), e);
    const cy = lerp(from.cy, to.cy, e);
    const size = lerp(from.size, to.size, e);
    const src = e < 0.5 ? from : to;
    drawText(ctx, { ...src, underline: e < 0.5 ? from.underline : to.underline }, o.theme, cx, cy, size, alpha);
  } else if (to.kind === "brace" && from.kind === "brace") {
    drawBrace(ctx, { ...to, x: lerp(from.x, to.x, e), y1: lerp(from.y1, to.y1, e), y2: lerp(from.y2, to.y2, e), ym: lerp(from.ym, to.ym, e) }, o.theme, alpha);
  } else if (to.kind === "bullet" && from.kind === "bullet") {
    drawBullet(ctx, { ...to, x: lerp(from.x, to.x, e), cy: lerp(from.cy, to.cy, e) }, o.theme, alpha, to.x > SW / 2);
  } else if (to.kind === "image" && from.kind === "image") {
    drawImageItem(ctx, { ...to, cx: lerp(from.cx, to.cx, e), cy: lerp(from.cy, to.cy, e), w: lerp(from.w, to.w, e), h: lerp(from.h, to.h, e) }, alpha);
  }
}

export function drawStatic(ctx: CanvasRenderingContext2D, step: Step, o: FrameOpts) {
  drawFrame(ctx, null, step, 1, o);
}
