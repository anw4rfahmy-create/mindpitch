import { useEffect, useRef, useState } from "react";
import { Sheet } from "./types";

interface Props {
  sheets: Sheet[];
  activeId: string;
  topicCount: number;
  unit?: string;
  onSelect(id: string): void;
  onAdd(): void;
  onRename(id: string, title: string): void;
  onDuplicate(id: string): void;
  onDelete(id: string): void;
  onMove(id: string, dir: -1 | 1): void;
  onReorder(id: string, toIndex: number): void;
}

export default function SheetBar(p: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; to: number } | null>(null);
  const dragRef = useRef<{ id: string; x0: number; y0: number; on: boolean; timer: number; touch: boolean; to: number } | null>(null);

  const targetIndex = (x: number) => {
    const els = Array.from(tabs.current?.querySelectorAll<HTMLElement>(".sheet-tab") ?? []);
    let to = els.length - 1;
    for (let i = 0; i < els.length; i++) {
      const r = els[i].getBoundingClientRect();
      if (x < r.left + r.width / 2) {
        to = i;
        break;
      }
    }
    return to;
  };
  const startDrag = (id: string, e: React.PointerEvent) => {
    if (editing || (e.target as HTMLElement).closest("input,.sheet-more")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const d = { id, x0: e.clientX, y0: e.clientY, on: false, timer: 0, touch: e.pointerType !== "mouse", to: 0 };
    dragRef.current = d;
    // di layar sentuh: tahan sebentar dulu supaya geser biasa tetap menggulir daftar lembar
    if (d.touch) d.timer = window.setTimeout(() => ((d.on = true), (d.to = p.sheets.findIndex((s) => s.id === id)), setDrag({ id, to: d.to }), navigator.vibrate?.(15)), 350);
    const move = (ev: PointerEvent) => {
      if (!d.on) {
        const dist = Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0);
        if (d.touch) {
          if (dist > 10) {
            window.clearTimeout(d.timer);
            cleanup();
          }
          return;
        }
        if (dist < 6) return;
        d.on = true;
      }
      ev.preventDefault();
      d.to = targetIndex(ev.clientX);
      setDrag({ id, to: d.to });
    };
    const tm = (ev: TouchEvent) => d.on && ev.cancelable && ev.preventDefault();
    const up = () => {
      window.clearTimeout(d.timer);
      const was = d.on;
      cleanup();
      if (was) {
        suppress.current = true;
        window.setTimeout(() => (suppress.current = false), 50);
        const from = p.sheets.findIndex((s) => s.id === id);
        if (d.to !== from) p.onReorder(id, d.to);
      }
      setDrag(null);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("touchmove", tm);
      dragRef.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("touchmove", tm, { passive: false });
  };
  const suppress = useRef(false);

  // panah gulir (untuk mouse/trackpad: layar sentuh cukup digeser)
  const [canL, setCanL] = useState(false);
  const [canR, setCanR] = useState(false);
  const holdRef = useRef(0);
  const measure = () => {
    const el = tabs.current;
    if (!el) return;
    setCanL(el.scrollLeft > 2);
    setCanR(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  };
  useEffect(() => {
    const el = tabs.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const wheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("scroll", measure);
      el.removeEventListener("wheel", wheel);
      ro.disconnect();
    };
  }, [p.sheets.length]);
  const scrollBy = (dir: -1 | 1, smooth = true) => tabs.current?.scrollBy({ left: dir * 220, behavior: smooth ? "smooth" : "auto" });
  const holdStart = (dir: -1 | 1) => {
    scrollBy(dir);
    window.clearTimeout(holdRef.current);
    holdRef.current = window.setTimeout(function loop() {
      tabs.current?.scrollBy({ left: dir * 28 });
      holdRef.current = window.setTimeout(loop, 30);
    }, 350);
  };
  const holdStop = () => window.clearTimeout(holdRef.current);

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
      <button className="sheet-arrow" hidden={!canL && !canR} disabled={!canL} onPointerDown={() => holdStart(-1)} onPointerUp={holdStop} onPointerLeave={holdStop} onPointerCancel={holdStop} aria-label="Gulir lembar ke kiri" title="Gulir ke kiri (tahan untuk terus)">
        ‹
      </button>
      <div className="sheet-tabs" ref={tabs}>
        {p.sheets.map((s) => (
          <div
            key={s.id}
            className={"sheet-tab" + (s.id === p.activeId ? " on" : "") + (drag?.id === s.id ? " dragging" : "") + (drag && drag.id !== s.id && p.sheets[drag.to]?.id === s.id ? (drag.to > p.sheets.findIndex((x) => x.id === drag.id) ? " drop-after" : " drop-before") : "")}
            onPointerDown={(e) => startDrag(s.id, e)}
            onClick={() => !suppress.current && p.onSelect(s.id)}
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
        <button className="sheet-add inline" onClick={p.onAdd} title="Tambah lembar" aria-label="Tambah lembar di akhir">
          +
        </button>
      </div>
      <button className="sheet-arrow" hidden={!canL && !canR} disabled={!canR} onPointerDown={() => holdStart(1)} onPointerUp={holdStop} onPointerLeave={holdStop} onPointerCancel={holdStop} aria-label="Gulir lembar ke kanan" title="Gulir ke kanan (tahan untuk terus)">
        ›
      </button>
      <div className="spacer" />
      <span className="sheet-status small muted">{p.topicCount} {p.unit ?? "topik"}</span>
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
