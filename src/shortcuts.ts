// Pintasan yang bisa disesuaikan (disimpan di perangkat).
export interface ShortcutDef {
  id: string;
  label: string;
  def: string;
}

export const SHORTCUTS: ShortcutDef[] = [
  { id: "relation", label: "Hubungan", def: "Ctrl+Shift+R" },
  { id: "boundary", label: "Batas", def: "Ctrl+Shift+B" },
  { id: "marker", label: "Penanda", def: "Ctrl+Shift+M" },
  { id: "link", label: "Tautan – Halaman Web", def: "Ctrl+K" },
  { id: "note", label: "Catatan", def: "Ctrl+Shift+N" },
  { id: "label", label: "Label", def: "Ctrl+Shift+L" },
  { id: "task", label: "Tugas", def: "Ctrl+Shift+T" },
  { id: "image", label: "Gambar Lokal", def: "Ctrl+Shift+I" },
  { id: "summary", label: "Ringkasan", def: "Ctrl+]" },
  { id: "zoomIn", label: "Perbesar", def: "Ctrl++" },
  { id: "zoomOut", label: "Perkecil", def: "Ctrl+-" },
  { id: "actual", label: "Ukuran Sebenarnya", def: "Ctrl+0" },
  { id: "fit", label: "Pas Layar", def: "Ctrl+9" },
  { id: "central", label: "Buka Topik Sentral", def: "Ctrl+R" },
  { id: "zen", label: "Mode ZEN", def: "Ctrl+Alt+Z" },
];

const KEY = "mapit-shortcuts";

export function loadShortcuts(): Record<string, string> {
  const m: Record<string, string> = {};
  for (const s of SHORTCUTS) m[s.id] = s.def;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    for (const id in raw) if (id in m && typeof raw[id] === "string") m[id] = raw[id];
  } catch {
    /* abaikan */
  }
  return m;
}
export function saveShortcuts(m: Record<string, string>) {
  try {
    const diff: Record<string, string> = {};
    for (const s of SHORTCUTS) if (m[s.id] !== s.def) diff[s.id] = m[s.id];
    localStorage.setItem(KEY, JSON.stringify(diff));
  } catch {
    /* abaikan */
  }
}

/** Ubah KeyboardEvent jadi teks kombinasi, mis. "Ctrl+Shift+R". Kosong bila hanya tombol pengubah. */
export function comboOf(e: KeyboardEvent): string {
  let k = e.key;
  if (["Control", "Shift", "Alt", "Meta"].includes(k)) return "";
  if (k === " ") k = "Space";
  if (k === "=") k = "+";
  if (k.length === 1) k = k.toUpperCase();
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey && !(k === "+" && !e.ctrlKey && false)) parts.push("Shift");
  parts.push(k);
  // "+" dan "]" dihasilkan dengan Shift di sebagian papan ketik: abaikan Shift untuk simbol
  return parts.filter((p, i) => !(p === "Shift" && /^[+\]\-=]$/.test(k) && i < parts.length - 1)).join("+");
}

export function findAction(m: Record<string, string>, combo: string): string | null {
  if (!combo) return null;
  for (const id in m) if (m[id] === combo) return id;
  return null;
}
