import { useEffect, useState } from "react";
import { comboOf, SHORTCUTS } from "./shortcuts";

export default function ShortcutsDialog({ map, onChange, onClose }: { map: Record<string, string>; onChange(m: Record<string, string>): void; onClose(): void }) {
  const [cap, setCap] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!cap) {
        if (e.key === "Escape") onClose();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") return setCap(null);
      const c = comboOf(e);
      if (!c) return;
      if (!/Ctrl|Alt|F\d/.test(c)) return setMsg("Gunakan kombinasi dengan Ctrl atau Alt (atau tombol F).");
      const clash = SHORTCUTS.find((s) => s.id !== cap && map[s.id] === c);
      if (clash) return setMsg(`"${c}" sudah dipakai untuk ${clash.label}.`);
      setMsg("");
      onChange({ ...map, [cap]: c });
      setCap(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [cap, map, onChange, onClose]);
  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal small-modal">
        <div className="modal-head">
          <b>Sesuaikan Pintasan</b>
          <div className="spacer" />
          <button className="btn icon small" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="small-body">
          <p className="small muted" style={{ margin: 0 }}>
            Klik sebuah pintasan, lalu tekan kombinasi baru. Berguna bila peramban memakai kombinasi yang sama (mis. Ctrl+Shift+N membuka jendela penyamaran).
          </p>
          {SHORTCUTS.map((s) => (
            <div key={s.id} className={"sc-row" + (cap === s.id ? " cap" : "")}>
              <span className="lbl">{s.label}</span>
              <kbd onClick={() => (setCap(s.id), setMsg(""))} style={{ cursor: "pointer" }}>
                {cap === s.id ? "Tekan tombol…" : map[s.id]}
              </kbd>
              {map[s.id] !== s.def && (
                <button className="btn small" onClick={() => onChange({ ...map, [s.id]: s.def })}>
                  ↺
                </button>
              )}
            </div>
          ))}
          {msg && <p className="small" style={{ color: "var(--danger)", margin: 0 }}>{msg}</p>}
          <div className="dlg-foot">
            <button className="btn" onClick={() => onChange(Object.fromEntries(SHORTCUTS.map((s) => [s.id, s.def])))}>
              Setel ulang semua
            </button>
            <div className="spacer" />
            <button className="btn primary" onClick={onClose}>
              Selesai
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
