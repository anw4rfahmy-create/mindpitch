import { FONT_FAMILY, wrapCached } from "./measure";
import { edgePath } from "./layout";
import { contrastText } from "./nodeStyle";
import { Slide, getLayout, groupItems, stepsOf } from "./slides";
import { Theme } from "./themes";
import { Transition } from "./types";

export const SW = 1280;
export const SH = 720;
const LEFT = 80;
const RIGHT = SW - 80;
const BOTTOM = SH - 56;

export interface SlideInfo {
  index: number;
  total: number;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function background(ctx: CanvasRenderingContext2D, theme: Theme) {
  const g = ctx.createLinearGradient(0, 0, SW, SH);
  g.addColorStop(0, theme.bg[0]);
  g.addColorStop(1, theme.bg[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SW, SH);
}

interface Fit {
  lines: string[];
  size: number;
  lineH: number;
  font: string;
}
function fitText(
  text: string,
  weight: number,
  maxW: number,
  maxH: number,
  start: number,
  min: number,
  maxLines: number
): Fit {
  let size = start;
  for (; size >= min; size -= 2) {
    const font = `${weight} ${size}px ${FONT_FAMILY}`;
    const lines = wrapCached(font, text, maxW);
    const lineH = Math.round(size * 1.2);
    if (lines.length <= maxLines && lines.length * lineH <= maxH) return { lines, size, lineH, font };
  }
  size = min;
  const font = `${weight} ${size}px ${FONT_FAMILY}`;
  const lines = wrapCached(font, text, maxW).slice(0, maxLines);
  return { lines, size, lineH: Math.round(size * 1.2), font };
}

function drawLines(ctx: CanvasRenderingContext2D, f: Fit, x: number, y: number, align: CanvasTextAlign = "left") {
  ctx.font = f.font;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  f.lines.forEach((l, i) => ctx.fillText(l, x, y + i * f.lineH));
}

function footer(ctx: CanvasRenderingContext2D, theme: Theme, info: SlideInfo, color: string) {
  const base = ctx.globalAlpha;
  ctx.globalAlpha = base * 0.9;
  ctx.fillStyle = color;
  ctx.fillRect(0, SH - 6, (SW * (info.index + 1)) / Math.max(info.total, 1), 6);
  ctx.globalAlpha = base * 0.8;
  ctx.fillStyle = theme.muted;
  ctx.font = `500 18px ${FONT_FAMILY}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`${info.index + 1} / ${info.total}`, SW - 40, SH - 24);
  ctx.globalAlpha = base;
}

// ---------------------------------------------------------------- sampul
function drawCover(ctx: CanvasRenderingContext2D, s: Slide, theme: Theme) {
  const base = ctx.globalAlpha;
  ctx.globalAlpha = base * 0.14;
  const dots: [number, number, number, number][] = [
    [1130, 110, 230, 0],
    [130, 650, 270, 1],
    [1010, 660, 120, 3],
    [220, 70, 90, 2],
  ];
  for (const [x, y, r, i] of dots) {
    ctx.fillStyle = theme.palette[i % theme.palette.length];
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = base;

  const title = fitText(s.title, 800, 1000, 300, 84, 40, 4);
  const sub = s.subtitle ? fitText(s.subtitle, 400, 900, 110, 30, 20, 3) : null;
  const titleH = title.lines.length * title.lineH;
  const subH = sub ? sub.lines.length * sub.lineH : 0;
  const total = titleH + 44 + (sub ? 28 + subH : 0);
  let y = (SH - total) / 2;
  ctx.fillStyle = theme.fg;
  drawLines(ctx, title, SW / 2, y, "center");
  y += titleH + 22;
  ctx.fillStyle = theme.accent;
  roundRect(ctx, SW / 2 - 45, y, 90, 8, 4);
  ctx.fill();
  if (sub) {
    y += 8 + 28;
    ctx.fillStyle = theme.muted;
    drawLines(ctx, sub, SW / 2, y, "center");
  }
}

// ---------------------------------------------------------------- header
function drawHeader(ctx: CanvasRenderingContext2D, s: Slide, theme: Theme, compact: boolean): number {
  let y = 56;
  if (s.kicker) {
    ctx.fillStyle = s.color;
    ctx.font = `700 22px ${FONT_FAMILY}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const k = wrapCached(ctx.font, s.kicker.toUpperCase(), 1000)[0] ?? "";
    ctx.fillText(k, LEFT, y);
    y += 34;
  }
  const t = fitText(s.title, 800, 1100, compact ? 100 : 150, compact ? 44 : 58, 30, 2);
  const th = t.lines.length * t.lineH;
  ctx.fillStyle = s.color;
  roundRect(ctx, LEFT - 24, y + 4, 8, th - 8, 4);
  ctx.fill();
  ctx.fillStyle = theme.fg;
  drawLines(ctx, t, LEFT, y);
  return y + th + (compact ? 20 : 34);
}

// ---------------------------------------------------------------- bullets
interface Metric {
  lines: string[];
  font: string;
  size: number;
  lineH: number;
  h: number;
  indent: number;
}
const BASE_SIZE = [34, 29, 25];

function measureItems(items: { text: string; level: number }[], scale: number, colW: number): Metric[] {
  return items.map((it) => {
    const size = Math.round(BASE_SIZE[Math.min(it.level, 2)] * scale);
    const font = `${it.level === 0 ? 600 : 400} ${size}px ${FONT_FAMILY}`;
    const indent = it.level * 34 * Math.max(scale, 0.7);
    const lines = wrapCached(font, it.text, colW - 38 - indent);
    const lineH = Math.round(size * 1.28);
    const gap = Math.round(size * (it.level === 0 ? 0.55 : 0.35));
    return { lines, font, size, lineH, h: lines.length * lineH + gap, indent };
  });
}

function drawBullets(ctx: CanvasRenderingContext2D, s: Slide, theme: Theme, reveal: number, top: number) {
  const base = ctx.globalAlpha;
  const availH = BOTTOM - top;
  const groups = groupItems(s.items);
  const flat = s.items;
  if (!flat.length) return;

  let chosen: { cols: number; scale: number; metrics: Metric[]; colOf: number[]; colW: number } | null = null;
  outer: for (const cols of [1, 2]) {
    const colW = (RIGHT - LEFT - (cols - 1) * 56) / cols;
    for (let scale = cols === 1 ? 1.45 : 1.1; scale >= 0.5; scale -= 0.05) {
      const metrics = measureItems(flat, scale, colW);
      // distribusi grup ke kolom secara berurutan
      const gh = groups.map((g) => 0);
      let idx = 0;
      groups.forEach((g, gi) => {
        for (let k = 0; k < g.length; k++) gh[gi] += metrics[idx++].h;
      });
      const totalH = gh.reduce((a, b) => a + b, 0);
      const colOf: number[] = [];
      const colH = new Array(cols).fill(0);
      let c = 0;
      groups.forEach((g, gi) => {
        if (c < cols - 1 && colH[c] + gh[gi] / 2 > totalH / cols) c++;
        colH[c] += gh[gi];
        for (let k = 0; k < g.length; k++) colOf.push(c);
      });
      if (Math.max(...colH) <= availH) {
        chosen = { cols, scale, metrics, colOf, colW };
        break outer;
      }
    }
  }
  if (!chosen) {
    const colW = (RIGHT - LEFT - 56) / 2;
    const metrics = measureItems(flat, 0.5, colW);
    const colOf: number[] = [];
    let acc = 0;
    const half = metrics.reduce((a, m) => a + m.h, 0) / 2;
    metrics.forEach((m) => {
      colOf.push(acc > half ? 1 : 0);
      acc += m.h;
    });
    chosen = { cols: 2, scale: 0.5, metrics, colOf, colW };
  }

  const { metrics, colOf, colW, scale } = chosen;
  const ys = new Array(chosen.cols).fill(top);
  flat.forEach((it, i) => {
    const m = metrics[i];
    const c = colOf[i];
    const x = LEFT + c * (colW + 56);
    const y = ys[c];
    ys[c] += m.h;
    const a = clamp01(reveal - i);
    if (a <= 0) return;
    const dy = (1 - easeOut(a)) * 18;
    ctx.save();
    ctx.globalAlpha = base * a * (it.level === 1 ? 0.92 : 1);
    ctx.translate(0, dy);
    const mx = x + m.indent + 9;
    const my = y + m.lineH / 2;
    if (it.level === 0) {
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(mx, my, 8 * Math.max(scale, 0.7), 0, Math.PI * 2);
      ctx.fill();
    } else if (it.level === 1) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(mx, my, 5.5, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = theme.muted;
      ctx.beginPath();
      ctx.arc(mx, my, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = it.level === 2 ? theme.muted : theme.fg;
    ctx.font = m.font;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    m.lines.forEach((l, li) => ctx.fillText(l, x + m.indent + 32, y + li * m.lineH));
    ctx.restore();
  });
  ctx.globalAlpha = base;
}

// ---------------------------------------------------------------- kartu
function drawCards(ctx: CanvasRenderingContext2D, s: Slide, theme: Theme, reveal: number, top: number) {
  const base = ctx.globalAlpha;
  const groups = groupItems(s.items);
  const n = groups.length;
  if (!n) return;
  const cols = n === 1 ? 1 : n <= 2 ? 2 : n === 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const gap = 28;
  const availH = BOTTOM - top;
  let cardW = (RIGHT - LEFT - (cols - 1) * gap) / cols;
  if (cols === 1) cardW = Math.min(cardW, 760);
  const maxCardH = Math.min(340, (availH - (rows - 1) * gap) / rows);
  const gridW = cols * cardW + (cols - 1) * gap;
  const gx = LEFT + (RIGHT - LEFT - gridW) / 2;
  const pad = 24;

  // cari skala font yang muat untuk semua kartu
  let scale = 1.3;
  const content = (sc: number) =>
    groups.map((g) => {
      const hs = Math.round(30 * sc);
      const hf = `700 ${hs}px ${FONT_FAMILY}`;
      const hl = wrapCached(hf, g[0].text, cardW - pad * 2);
      const hLH = Math.round(hs * 1.22);
      const ss = Math.round(22 * sc);
      const sf = `400 ${ss}px ${FONT_FAMILY}`;
      const sLH = Math.round(ss * 1.3);
      const subs = g.slice(1).map((it) => ({
        lines: wrapCached(sf, it.text, cardW - pad * 2 - 22 - (it.level - 1) * 18),
        level: it.level,
      }));
      const subH = subs.reduce((a, b) => a + b.lines.length * sLH + 6, 0);
      return { hf, hl, hLH, sf, sLH, subs, h: 10 + pad * 0.7 + hl.length * hLH + (subs.length ? 12 : 0) + subH + pad * 0.7 };
    });
  let metrics = content(scale);
  while (scale > 0.5 && metrics.some((m) => m.h > maxCardH)) {
    scale -= 0.05;
    metrics = content(scale);
  }
  // tinggi kartu mengikuti isi; seluruh grid diletakkan agak ke tengah secara vertikal
  const contentH = Math.max(...metrics.map((m) => m.h));
  const cardH = Math.min(maxCardH, Math.max(contentH + 20, 130));
  const gridH = rows * cardH + (rows - 1) * gap;
  const gy = top + Math.max(0, (availH - gridH) / 2) * 0.75;

  groups.forEach((g, i) => {
    const a = clamp01(reveal - i);
    if (a <= 0) return;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = gx + col * (cardW + gap);
    const y = gy + row * (cardH + gap) + (1 - easeOut(a)) * 24;
    const color = theme.palette[i % theme.palette.length];
    const m = metrics[i];
    ctx.save();
    ctx.globalAlpha = base * a;
    ctx.shadowColor = "rgba(15,23,42,0.16)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = theme.card;
    roundRect(ctx, x, y, cardW, cardH, 18);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.save();
    roundRect(ctx, x, y, cardW, cardH, 18);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.fillRect(x, y, cardW, 10);
    ctx.restore();
    // isi kartu diposisikan di tengah secara vertikal
    let ty = y + 10 + Math.max(0, (cardH - m.h) / 2) + pad * 0.7;
    ctx.fillStyle = theme.id === "gelap" ? "#f1f5f9" : "#0f172a";
    ctx.font = m.hf;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    m.hl.forEach((l, li) => ctx.fillText(l, x + pad, ty + li * m.hLH));
    ty += m.hl.length * m.hLH + 12;
    ctx.font = m.sf;
    for (const sub of m.subs) {
      const ind = (sub.level - 1) * 18;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + pad + ind + 6, ty + m.sLH / 2, sub.level === 1 ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = theme.muted;
      sub.lines.forEach((l, li) => ctx.fillText(l, x + pad + ind + 22, ty + li * m.sLH));
      ty += sub.lines.length * m.sLH + 6;
    }
    ctx.restore();
  });
  ctx.globalAlpha = base;
}

// ---------------------------------------------------------------- peta mini
function drawMap(ctx: CanvasRenderingContext2D, s: Slide, theme: Theme, reveal: number, top: number) {
  const base = ctx.globalAlpha;
  const lay = getLayout(s);
  const b = lay.bounds;
  const areaX = 50,
    areaW = SW - 100,
    areaH = BOTTOM - top;
  const sc = Math.min(areaW / b.w, areaH / b.h, 2);
  const ox = areaX + (areaW - b.w * sc) / 2 - b.x * sc;
  const oy = top + (areaH - b.h * sc) / 2 - b.y * sc;

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(sc, sc);
  lay.order.forEach((id, i) => {
    const n = lay.nodes[id];
    const a = i === 0 ? 1 : clamp01(reveal - (i - 1));
    if (a <= 0 || !n.parentId) return;
    ctx.globalAlpha = base * a;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = n.depth === 1 ? 3.5 : 2.2;
    ctx.lineCap = "round";
    ctx.stroke(new Path2D(edgePath(lay.nodes[n.parentId], n)));
  });
  lay.order.forEach((id, i) => {
    const n = lay.nodes[id];
    const a = i === 0 ? 1 : clamp01(reveal - (i - 1));
    if (a <= 0) return;
    ctx.globalAlpha = base * a;
    const pop = i === 0 ? 1 : 0.9 + 0.1 * easeOut(a);
    ctx.save();
    ctx.translate(n.x + n.w / 2, n.y + n.h / 2);
    ctx.scale(pop, pop);
    ctx.translate(-n.w / 2, -n.h / 2);
    let textColor = theme.fg;
    if (n.depth === 0) {
      ctx.fillStyle = s.color;
      roundRect(ctx, 0, 0, n.w, n.h, n.h / 2);
      ctx.fill();
      textColor = contrastText(s.color);
    } else if (n.depth === 1) {
      ctx.fillStyle = theme.card;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2.5;
      roundRect(ctx, 0, 0, n.w, n.h, 10);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, n.h);
      ctx.lineTo(n.w, n.h);
      ctx.stroke();
    }
    ctx.fillStyle = textColor;
    ctx.font = n.font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const y0 = (n.h - n.lines.length * n.lineH) / 2;
    n.lines.forEach((l, li) => ctx.fillText(l, n.w / 2, y0 + n.lineH * (li + 0.5)));
    ctx.restore();
  });
  ctx.restore();
  ctx.globalAlpha = base;
}

// ---------------------------------------------------------------- slide
/** Gambar satu slide pada kanvas virtual 1280x720. reveal = jumlah item yang sudah tampil (pecahan = animasi). */
export function drawSlide(
  ctx: CanvasRenderingContext2D,
  s: Slide,
  theme: Theme,
  reveal: number,
  info: SlideInfo
) {
  ctx.save();
  background(ctx, theme);
  if (s.kind === "cover") {
    drawCover(ctx, s, theme);
  } else {
    const top = drawHeader(ctx, s, theme, s.style === "map");
    if (s.style === "cards") drawCards(ctx, s, theme, reveal, top);
    else if (s.style === "map") drawMap(ctx, s, theme, reveal, top);
    else drawBullets(ctx, s, theme, reveal, top);
  }
  footer(ctx, theme, info, s.color);
  ctx.restore();
}

export function drawTransition(
  ctx: CanvasRenderingContext2D,
  a: Slide,
  b: Slide,
  theme: Theme,
  type: Transition,
  p: number,
  ra: number,
  rb: number,
  ia: SlideInfo,
  ib: SlideInfo,
  dir: 1 | -1 = 1
) {
  if (type === "none" || p >= 1) {
    drawSlide(ctx, b, theme, rb, ib);
    return;
  }
  if (type === "fade") {
    drawSlide(ctx, a, theme, ra, ia);
    ctx.save();
    ctx.globalAlpha = easeInOut(p);
    drawSlide(ctx, b, theme, rb, ib);
    ctx.restore();
    return;
  }
  const e = easeInOut(p);
  ctx.save();
  ctx.translate(-dir * SW * e, 0);
  drawSlide(ctx, a, theme, ra, ia);
  ctx.restore();
  ctx.save();
  ctx.translate(dir * SW * (1 - e), 0);
  drawSlide(ctx, b, theme, rb, ib);
  ctx.restore();
}

export { stepsOf };
