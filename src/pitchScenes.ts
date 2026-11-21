// Pembangun adegan Pitch bergaya "drill-down" (menyelam per cabang): topik bergerak dari kanan ke kiri,
// kurung kurawal membuka anak-anaknya satu per satu, lalu menyelam ke tingkat berikutnya.
import { fontString, isRtl } from "./fonts";
import { textWidth, wrapCached } from "./measure";
import { Sheet } from "./types";

export const SW = 1280;
export const SH = 720;

export type Role = "fg" | "muted";

export interface TextItem {
  kind: "text";
  key: string;
  lines: string[];
  ax: number; // jangkar x (kiri/kanan/tengah sesuai align)
  cy: number; // pusat vertikal
  size: number;
  weight: number;
  font: string;
  align: "left" | "right" | "center";
  role: Role;
  underline?: boolean;
  rtl: boolean;
  alpha: number;
}
export interface BraceItem {
  kind: "brace";
  key: string;
  x: number;
  y1: number;
  y2: number;
  ym: number;
  dir: 1 | -1;
  alpha: number;
}
export interface BulletItem {
  kind: "bullet";
  key: string;
  x: number;
  cy: number;
  size: number;
  alpha: number;
}
export interface ImageItem {
  kind: "image";
  key: string;
  fileId: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  alpha: number;
}
export type Item = TextItem | BraceItem | BulletItem | ImageItem;

export interface Step {
  items: Item[];
  nodeId: string;
  label: string;
  note?: string;
}

interface Opts {
  startId: string;
  focus: boolean;
  textScale: number;
}

const LH = 1.32;

function mkText(sheet: Sheet, id: string, key: string, size: number, weight: number, maxW: number, role: Role = "fg"): TextItem & { w: number; h: number } {
  const n = sheet.nodes[id];
  const font = fontString(n.font ?? sheet.font, weight, size, false);
  const rtl = isRtl(n.text);
  const lines = wrapCached(font, n.text, maxW);
  let w = 0;
  for (const l of lines) w = Math.max(w, textWidth(font, l));
  const h = lines.length * size * (rtl ? LH + 0.18 : LH);
  return { kind: "text", key, lines, ax: 0, cy: 0, size, weight, font: n.font ?? sheet.font, align: "left", role, rtl, alpha: 1, w, h };
}

export function buildSteps(sheet: Sheet, opts: Opts): Step[] {
  const N = sheet.nodes;
  const ex = new Set(sheet.pitch.excluded);
  const sc = opts.textScale;
  const kids = (id: string) => (N[id]?.children ?? []).filter((c) => N[c] && !ex.has(c));
  const steps: Step[] = [];
  const start = N[opts.startId] ? opts.startId : sheet.rootId;

  const titleImage = (id: string, cx: number, cy: number): ImageItem[] => {
    const im = N[id].image;
    if (!im) return [];
    const w = Math.min(260, 120 + (im.size === "L" ? 140 : im.size === "M" ? 60 : 0));
    return [{ kind: "image", key: "im:" + id, fileId: im.fileId, cx, cy, w, h: w / (im.ar || 1), alpha: 1 }];
  };

  const push = (id: string, items: Item[]) => steps.push({ items, nodeId: id, label: N[id].text.split("\n")[0], note: N[id].note });

  /** Judul di tengah layar (langkah fokus). */
  const focusStep = (id: string) => {
    const t = mkText(sheet, id, "t:" + id, 84 * sc, 700, 1000);
    t.align = "center";
    t.ax = SW / 2;
    t.cy = SH / 2;
    const items: Item[] = [t, ...titleImage(id, SW / 2, SH / 2 + t.h / 2 + 130)];
    push(id, items);
  };

  /** Judul di kiri, kurung kurawal, dan `k` anak pertama. */
  const braceStep = (id: string, k: number) => {
    const ch = kids(id).slice(0, k);
    const rtl = isRtl(N[id].text);
    const mx = (x: number) => (rtl ? SW - x : x);
    const al: "left" | "right" = rtl ? "right" : "left";
    const title = mkText(sheet, id, "t:" + id, 56 * sc, 700, 520);
    title.ax = mx(96);
    title.align = al;
    title.cy = SH / 2;
    const x0 = 96 + title.w + 40;
    const cx = x0 + 52;
    const maxW = Math.max(240, SW - 70 - cx);
    let scale = 1;
    let kidsT = ch.map((c) => mkText(sheet, c, "t:" + c, 42 * sc, 600, maxW));
    const gap = 26;
    const total = () => kidsT.reduce((a, t) => a + t.h, 0) + gap * Math.max(0, kidsT.length - 1);
    if (total() > 590) {
      scale = Math.max(0.55, 590 / total());
      kidsT = ch.map((c) => mkText(sheet, c, "t:" + c, 42 * sc * scale, 600, maxW));
    }
    let y = SH / 2 - total() / 2;
    for (const t of kidsT) {
      t.ax = mx(cx);
      t.align = al;
      t.cy = y + t.h / 2;
      y += t.h + gap * scale;
    }
    const items: Item[] = [title, ...titleImage(id, mx(96 + title.w / 2), SH / 2 + title.h / 2 + 110)];
    if (kidsT.length) {
      const y1 = kidsT[0].cy - kidsT[0].h / 2 - 8;
      const y2 = kidsT[kidsT.length - 1].cy + kidsT[kidsT.length - 1].h / 2 + 8;
      items.push({ kind: "brace", key: "br:" + id, x: mx(x0), y1, y2, ym: SH / 2, dir: rtl ? -1 : 1, alpha: 1 });
    }
    items.push(...kidsT);
    push(id, items);
  };

  /** Mode daftar: judul di kiri atas, induk bergaris bawah, lalu butir ▶ satu per satu. */
  const listStep = (id: string, k: number) => {
    const parentId = N[id].parentId;
    const rtl = isRtl(N[id].text);
    const mx = (x: number) => (rtl ? SW - x : x);
    const al: "left" | "right" = rtl ? "right" : "left";
    const items: Item[] = [];
    if (parentId && N[parentId]) {
      const bc = mkText(sheet, parentId, "t:" + parentId, 28 * sc, 600, 700, "muted");
      bc.ax = mx(96);
      bc.align = al;
      bc.cy = 84;
      bc.underline = true;
      items.push(bc);
    }
    const title = mkText(sheet, id, "t:" + id, 62 * sc, 700, 1000);
    title.ax = mx(96);
    title.align = al;
    title.cy = 172;
    items.push(title);
    const ch = kids(id).slice(0, k);
    const maxW = 980;
    let ts = ch.map((c) => mkText(sheet, c, "t:" + c, 40 * sc, 500, maxW));
    const gap = 24;
    const total = () => ts.reduce((a, t) => a + t.h, 0) + gap * Math.max(0, ts.length - 1);
    let scale = 1;
    const avail = 400;
    const all = kids(id).map((c) => mkText(sheet, c, "t:" + c, 40 * sc, 500, maxW));
    const allTotal = all.reduce((a, t) => a + t.h, 0) + gap * Math.max(0, all.length - 1);
    if (allTotal > avail) {
      scale = Math.max(0.55, avail / allTotal);
      ts = ch.map((c) => mkText(sheet, c, "t:" + c, 40 * sc * scale, 500, maxW));
    }
    void total;
    let y = 272;
    ts.forEach((t, i) => {
      t.ax = mx(156);
      t.align = al;
      t.cy = y + t.h / 2;
      items.push({ kind: "bullet", key: "bl:" + ch[i], x: mx(106), cy: t.cy - (t.lines.length - 1) * t.size * 0.62, size: 22 * sc * scale, alpha: 1 });
      items.push(t);
      y += t.h + gap * scale;
    });
    push(id, items);
  };

  const allLeaves = (id: string) => kids(id).every((c) => kids(c).length === 0);

  const scene = (id: string, isStart: boolean) => {
    const ch = kids(id);
    if (isStart) focusStep(id);
    if (!isStart && allLeaves(id) && ch.length) {
      listStep(id, 0);
      for (let i = 1; i <= ch.length; i++) listStep(id, i);
      return;
    }
    if (!ch.length) return;
    for (let i = 1; i <= ch.length; i++) {
      braceStep(id, i);
      const c = ch[i - 1];
      if (kids(c).length) {
        scene(c, false);
        braceStep(id, i); // kembali ke gambaran induk
      }
    }
  };

  const r = kids(start);
  if (!r.length) focusStep(start);
  else scene(start, true);
  if (!opts.focus && steps.length > 1 && r.length) steps.shift();
  return steps;
}
