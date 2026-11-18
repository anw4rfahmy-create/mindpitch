export interface Theme {
  id: string;
  name: string;
  bg: [string, string]; // gradien atas-kiri → bawah-kanan
  fg: string;
  muted: string;
  accent: string;
  card: string; // warna latar kartu
  onAccent: string; // teks di atas warna aksen
  palette: string[];
}

export const THEMES: Theme[] = [
  {
    id: "terang",
    name: "Terang",
    bg: ["#ffffff", "#eef2ff"],
    fg: "#0f172a",
    muted: "#64748b",
    accent: "#4f46e5",
    card: "#ffffff",
    onAccent: "#ffffff",
    palette: ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#0ea5e9", "#8b5cf6", "#ef4444", "#14b8a6"],
  },
  {
    id: "gelap",
    name: "Gelap",
    bg: ["#0b1020", "#1a1f3a"],
    fg: "#f1f5f9",
    muted: "#94a3b8",
    accent: "#818cf8",
    card: "#1e2342",
    onAccent: "#0b1020",
    palette: ["#818cf8", "#f472b6", "#fbbf24", "#34d399", "#38bdf8", "#a78bfa", "#f87171", "#2dd4bf"],
  },
  {
    id: "laut",
    name: "Laut",
    bg: ["#e0f7fa", "#b2ebf2"],
    fg: "#06303a",
    muted: "#38707c",
    accent: "#0891b2",
    card: "#ffffff",
    onAccent: "#ffffff",
    palette: ["#0891b2", "#0284c7", "#4f46e5", "#0d9488", "#2563eb", "#7c3aed", "#0e7490", "#059669"],
  },
  {
    id: "hutan",
    name: "Hutan",
    bg: ["#f0fdf4", "#d9f2df"],
    fg: "#14301f",
    muted: "#4d6b59",
    accent: "#16a34a",
    card: "#ffffff",
    onAccent: "#ffffff",
    palette: ["#16a34a", "#65a30d", "#ca8a04", "#0d9488", "#b45309", "#15803d", "#84cc16", "#0f766e"],
  },
  {
    id: "senja",
    name: "Senja",
    bg: ["#fff7ed", "#fde1d3"],
    fg: "#3b1d12",
    muted: "#8a5a47",
    accent: "#ea580c",
    card: "#ffffff",
    onAccent: "#ffffff",
    palette: ["#ea580c", "#db2777", "#d97706", "#dc2626", "#c026d3", "#e11d48", "#f59e0b", "#9333ea"],
  },
];

export const themeById = (id: string): Theme => THEMES.find((t) => t.id === id) ?? THEMES[0];
