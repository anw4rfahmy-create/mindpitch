// Palet warna cabang untuk peta
export interface MapPalette {
  id: string;
  name: string;
  colors: string[];
}

export const MAP_PALETTES: MapPalette[] = [
  {
    id: "pelangi",
    name: "Pelangi",
    colors: ["#e5534b", "#e8b931", "#f08a5d", "#3fae7f", "#4c8bf5", "#9b6bdf", "#ec6ca5", "#3fb8c4"],
  },
  {
    id: "pastel",
    name: "Pastel",
    colors: ["#f28b82", "#fbbc04", "#a7d86e", "#78d9ec", "#aecbfa", "#d7aefb", "#fdcfe8", "#e6c9a8"],
  },
  {
    id: "laut",
    name: "Laut",
    colors: ["#0891b2", "#0284c7", "#4f46e5", "#0d9488", "#2563eb", "#7c3aed", "#0e7490", "#059669"],
  },
  {
    id: "hutan",
    name: "Hutan",
    colors: ["#16a34a", "#65a30d", "#ca8a04", "#0d9488", "#b45309", "#15803d", "#84cc16", "#0f766e"],
  },
  {
    id: "senja",
    name: "Senja",
    colors: ["#ea580c", "#db2777", "#d97706", "#dc2626", "#c026d3", "#e11d48", "#f59e0b", "#9333ea"],
  },
  {
    id: "mono",
    name: "Abu-abu",
    colors: ["#475569", "#64748b", "#334155", "#6b7280", "#52525b", "#71717a", "#44403c", "#57534e"],
  },
];

export const paletteById = (id: string): MapPalette => MAP_PALETTES.find((p) => p.id === id) ?? MAP_PALETTES[0];

// Tema tampilan Pitch
export interface PitchTheme {
  id: string;
  name: string;
  bg: [string, string]; // gradasi atas → bawah
  fg: string;
  muted: string;
  accent: string;
}

export const PITCH_THEMES: PitchTheme[] = [
  { id: "biru", name: "Biru", bg: ["#1c2680", "#4a63dc"], fg: "#ffffff", muted: "rgba(255,255,255,0.7)", accent: "#ffffff" },
  { id: "ungu", name: "Ungu", bg: ["#2e1768", "#8b53d8"], fg: "#ffffff", muted: "rgba(255,255,255,0.7)", accent: "#ffffff" },
  { id: "laut", name: "Laut", bg: ["#03384f", "#1aa0b8"], fg: "#ffffff", muted: "rgba(255,255,255,0.72)", accent: "#ffffff" },
  { id: "hijau", name: "Hijau", bg: ["#0b3d2e", "#2fa77d"], fg: "#ffffff", muted: "rgba(255,255,255,0.72)", accent: "#ffffff" },
  { id: "senja", name: "Senja", bg: ["#6e1a3a", "#f08a4b"], fg: "#ffffff", muted: "rgba(255,255,255,0.75)", accent: "#ffffff" },
  { id: "hitam", name: "Hitam", bg: ["#07090f", "#262e48"], fg: "#ffffff", muted: "rgba(255,255,255,0.65)", accent: "#ffffff" },
  { id: "terang", name: "Terang", bg: ["#f8fafc", "#d9e3ff"], fg: "#0f172a", muted: "rgba(15,23,42,0.62)", accent: "#0f172a" },
];

export const pitchThemeById = (id: string): PitchTheme => PITCH_THEMES.find((t) => t.id === id) ?? PITCH_THEMES[0];
