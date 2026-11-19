// Font yang dibundel bersama aplikasi (tetap jalan offline).
import "@fontsource/amiri/arabic-400.css";
import "@fontsource/amiri/arabic-700.css";
import "@fontsource/amiri/latin-400.css";
import "@fontsource/amiri/latin-700.css";
import "@fontsource/scheherazade-new/arabic-400.css";
import "@fontsource/scheherazade-new/arabic-700.css";
import "@fontsource/scheherazade-new/latin-400.css";
import "@fontsource/scheherazade-new/latin-700.css";
import "@fontsource/noto-naskh-arabic/arabic-400.css";
import "@fontsource/noto-naskh-arabic/arabic-700.css";
import "@fontsource/noto-naskh-arabic/latin-400.css";
import "@fontsource/noto-naskh-arabic/latin-700.css";
import "@fontsource/cairo/arabic-400.css";
import "@fontsource/cairo/arabic-700.css";
import "@fontsource/cairo/latin-400.css";
import "@fontsource/cairo/latin-700.css";
import "@fontsource/tajawal/arabic-400.css";
import "@fontsource/tajawal/arabic-700.css";
import "@fontsource/tajawal/latin-400.css";
import "@fontsource/tajawal/latin-700.css";
import "@fontsource/aref-ruqaa/arabic-400.css";
import "@fontsource/aref-ruqaa/arabic-700.css";
import "@fontsource/aref-ruqaa/latin-400.css";
import "@fontsource/aref-ruqaa/latin-700.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/poppins/latin-400.css";
import "@fontsource/poppins/latin-700.css";
import "@fontsource/nunito/latin-400.css";
import "@fontsource/nunito/latin-700.css";
import "@fontsource/merriweather/latin-400.css";
import "@fontsource/merriweather/latin-700.css";
import "@fontsource/patrick-hand/latin-400.css";

import { clearMeasureCache } from "./measure";

export const SYSTEM_STACK =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export interface FontDef {
  id: string;
  name: string;
  family: string; // nama keluarga CSS tanpa fallback
  group: "Bawaan" | "Arab" | "Indonesia / Latin";
  sample: string;
}

const AR = "اَلْوَضْعُ تَعْرِيفُهُ";
const LA = "Peta pikiran Indonesia";

export const FONTS: FontDef[] = [
  { id: "system", name: "Bawaan perangkat", family: "", group: "Bawaan", sample: LA },
  { id: "amiri", name: "Amiri (Naskh klasik)", family: "Amiri", group: "Arab", sample: AR },
  { id: "scheherazade", name: "Scheherazade New (harakat jelas)", family: "Scheherazade New", group: "Arab", sample: AR },
  { id: "naskh", name: "Noto Naskh Arabic", family: "Noto Naskh Arabic", group: "Arab", sample: AR },
  { id: "cairo", name: "Cairo (modern)", family: "Cairo", group: "Arab", sample: AR },
  { id: "tajawal", name: "Tajawal (modern ringan)", family: "Tajawal", group: "Arab", sample: AR },
  { id: "ruqaa", name: "Aref Ruqaa (Ruq'ah)", family: "Aref Ruqaa", group: "Arab", sample: AR },
  { id: "inter", name: "Inter", family: "Inter", group: "Indonesia / Latin", sample: LA },
  { id: "poppins", name: "Poppins", family: "Poppins", group: "Indonesia / Latin", sample: LA },
  { id: "nunito", name: "Nunito (ramah)", family: "Nunito", group: "Indonesia / Latin", sample: LA },
  { id: "merriweather", name: "Merriweather (serif)", family: "Merriweather", group: "Indonesia / Latin", sample: LA },
  { id: "patrick", name: "Patrick Hand (tulisan tangan)", family: "Patrick Hand", group: "Indonesia / Latin", sample: LA },
];

export const fontById = (id?: string): FontDef => FONTS.find((f) => f.id === id) ?? FONTS[0];

/** Daftar keluarga font untuk properti CSS font. Font Arab diberi cadangan Latin dan sistem. */
export function familyCss(id?: string): string {
  const f = fontById(id);
  if (!f.family) return SYSTEM_STACK;
  return `"${f.family}", ${SYSTEM_STACK}`;
}

export function fontString(id: string | undefined, weight: number, size: number, italic = false): string {
  return `${italic ? "italic " : ""}${weight} ${size}px ${familyCss(id)}`;
}

/** Teks dianggap RTL bila karakter kuat pertama berasal dari aksara Arab/Ibrani. */
export function isRtl(text: string): boolean {
  for (const ch of text) {
    if (/[֐-ࣿיִ-﷿ﹰ-﻿]/.test(ch)) return true;
    if (/[A-Za-zÀ-ɏ]/.test(ch)) return false;
  }
  return false;
}

const loading = new Map<string, Promise<void>>();

/** Pastikan font (dan bobotnya) sudah dimuat sebelum mengukur/menggambar teks. */
export function ensureFonts(ids: string[]): Promise<void> {
  const jobs: Promise<unknown>[] = [];
  for (const id of new Set(ids)) {
    const f = fontById(id);
    if (!f.family) continue;
    for (const w of [400, 700]) {
      const key = `${f.family}|${w}`;
      if (!loading.has(key)) {
        const p = Promise.all([
          document.fonts.load(`${w} 16px "${f.family}"`, "AaBb"),
          document.fonts.load(`${w} 16px "${f.family}"`, "اَلْوَضْعُ"),
        ])
          .then(() => undefined)
          .catch(() => undefined);
        loading.set(key, p);
      }
      jobs.push(loading.get(key)!);
    }
  }
  return Promise.all(jobs).then(() => {
    clearMeasureCache();
  });
}
