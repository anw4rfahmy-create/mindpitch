import { useEffect, useRef, useState } from "react";
import { Sheet } from "./types";

interface Props {
  sheets: Sheet[];
  activeId: string;
  topicCount: number;
  onSelect(id: string): void;
  onAdd(): void;
  onRename(id: string, title: string): void;
  onDuplicate(id: string): void;
  onDelete(id: string): void;
  onMove(id: string, dir: -1 | 1): void;
}

export default function SheetBar(p: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const tabs = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = tabs.current?.querySelector<HTMLElement>(".sheet-tab.on");
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [p.activeId, p.sheets.length]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menu]);

  const openMenu = (id: string, e: React.MouseEvent | React.PointerEvent, el?: HTMLElement) => {
    e.preventDefault();
    e.stopPropagation();
    const r = el?.getBoundingClientRect();
    setMenu({ id, x: r ? r.left : e.clientX, y: r ? r.top : e.clientY });
  };

  const idx = menu ? p.sheets.findIndex((s) => s.id === menu.id) : -1;

  return (
    <div className="sheetbar">
      <button className="sheet-add" onClick={p.onAdd} title="Tambah lembar" aria-label="Tambah lembar">
        +
      </button>
      <div className="sheet-tabs" ref={tabs}>
        {p.sheets.map((s) => (
          <div
            key={s.id}
            className={"sheet-tab" + (s.id === p.activeId ? " on" : "")}
            onClick={() => p.onSelect(s.id)}
            onDoubleClick={() => setEditing(s.id)}
            onContextMenu={(e) => openMenu(s.id, e)}
          >
            {editing === s.id ? (
              <input
                autoFocus
                defaultValue={s.title}
                onFocus={(e) => e.currentTarget.select()}
                onBlur={(e) => {
                  setEditing(null);
                  const t = e.currentTarget.value.trim();
                  if (t && t !== s.title) p.onRename(s.id, t);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") {
                    e.currentTarget.value = s.title;
                    e.currentTarget.blur();
                  }
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="sheet-name">{s.title}</span>
            )}
            {s.id === p.activeId && editing !== s.id && (
              <button
                className="sheet-more"
                aria-label="Menu lembar"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => openMenu(s.id, e, e.currentTarget.parentElement as HTMLElement)}
              >
                ⋯
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="spacer" />
      <span className="sheet-status small muted">{p.topicCount} topik</span>
      {menu && (
        <div className="menu sheet-menu" style={{ left: menu.x, bottom: window.innerHeight - menu.y + 4 }} onPointerDown={(e) => e.stopPropagation()}>
          <button
            onClick={() => {
              setEditing(menu.id);
              setMenu(null);
            }}
          >
            Ubah nama
          </button>
          <button
            onClick={() => {
              p.onDuplicate(menu.id);
              setMenu(null);
            }}
          >
            Gandakan
          </button>
          <button
            disabled={idx <= 0}
            onClick={() => {
              p.onMove(menu.id, -1);
              setMenu(null);
            }}
          >
            ◂ Geser ke kiri
          </button>
          <button
            disabled={idx >= p.sheets.length - 1}
            onClick={() => {
              p.onMove(menu.id, 1);
              setMenu(null);
            }}
          >
            Geser ke kanan ▸
          </button>
          <button
            className="danger"
            disabled={p.sheets.length < 2}
            onClick={() => {
              p.onDelete(menu.id);
              setMenu(null);
            }}
          >
            Hapus lembar
          </button>
        </div>
      )}
    </div>
  );
}
