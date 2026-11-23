import { PatternId } from "./types";

export const PATTERNS: { id: PatternId; label: string }[] = [
  { id: "none", label: "Polos" },
  { id: "diag", label: "Arsir ╱" },
  { id: "diag2", label: "Arsir ╲" },
  { id: "cross", label: "Silang" },
  { id: "dots", label: "Titik" },
  { id: "horiz", label: "Garis ═" },
  { id: "vert", label: "Garis ║" },
];

/** Arsir gaya sketsa tangan (isi coretan + tepi bergoyang). */
export const SKETCH_PATTERNS: { id: PatternId; label: string }[] = [
  { id: "sk-solid", label: "Sketsa polos" },
  { id: "sk-diag", label: "Sketsa ╱" },
  { id: "sk-diag2", label: "Sketsa ╲" },
  { id: "sk-cross", label: "Sketsa ✕" },
  { id: "sk-horiz", label: "Sketsa ═" },
];

export type RegularPattern = "diag" | "diag2" | "cross" | "dots" | "horiz" | "vert";
const S = 8;

/** Isi SVG (sel 8×8) untuk satu pola. */
export function patternInner(kind: RegularPattern, color: string): string {
  const st = `stroke="${color}" stroke-width="1.3" fill="none" stroke-linecap="square"`;
  switch (kind) {
    case "diag":
      return `<path d="M-2,2 L2,-2 M0,8 L8,0 M6,10 L10,6" ${st}/>`;
    case "diag2":
      return `<path d="M-2,6 L2,10 M0,0 L8,8 M6,-2 L10,2" ${st}/>`;
    case "cross":
      return `<path d="M-2,2 L2,-2 M0,8 L8,0 M6,10 L10,6 M-2,6 L2,10 M0,0 L8,8 M6,-2 L10,2" ${st}/>`;
    case "dots":
      return `<circle cx="4" cy="4" r="1.5" fill="${color}"/>`;
    case "horiz":
      return `<path d="M0,4 H8" ${st}/>`;
    case "vert":
      return `<path d="M4,0 V8" ${st}/>`;
  }
}

export const patternId = (kind: string, color: string) => "pt-" + kind + "-" + color.replace(/[^a-z0-9]/gi, "");

export const patternDef = (kind: RegularPattern, color: string) =>
  `<pattern id="${patternId(kind, color)}" width="${S}" height="${S}" patternUnits="userSpaceOnUse">${patternInner(kind, color)}</pattern>`;

const cache = new Map<string, CanvasPattern>();

/** Pola untuk kanvas 2D (ekspor PNG/PDF). */
export function canvasPattern(ctx: CanvasRenderingContext2D, kind: RegularPattern, color: string): CanvasPattern | null {
  const key = kind + color;
  const hit = cache.get(key);
  if (hit) return hit;
  const k = 4; // resolusi tinggi agar tajam saat diperbesar
  const c = document.createElement("canvas");
  c.width = c.height = S * k;
  const g = c.getContext("2d")!;
  g.scale(k, k);
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = 1.3;
  g.lineCap = "square";
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  };
  const d1 = () => {
    line(-2, 2, 2, -2);
    line(0, 8, 8, 0);
    line(6, 10, 10, 6);
  };
  const d2 = () => {
    line(-2, 6, 2, 10);
    line(0, 0, 8, 8);
    line(6, -2, 10, 2);
  };
  if (kind === "diag") d1();
  else if (kind === "diag2") d2();
  else if (kind === "cross") (d1(), d2());
  else if (kind === "dots") {
    g.beginPath();
    g.arc(4, 4, 1.5, 0, Math.PI * 2);
    g.fill();
  } else if (kind === "horiz") line(0, 4, 8, 4);
  else line(4, 0, 4, 8);
  const p = ctx.createPattern(c, "repeat")!;
  p.setTransform(new DOMMatrix().scale(1 / k)); // sel 8×8 satuan dunia
  cache.set(key, p);
  return p;
}
