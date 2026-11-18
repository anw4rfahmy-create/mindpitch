import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PointerEvent as RPointerEvent } from "react";
import { LayoutResult, LNode, edgePath } from "./layout";
import { MapDoc } from "./types";
import { styleFor } from "./nodeStyle";
import { isDescendant } from "./model";

interface View {
  x: number;
  y: number;
  k: number;
}

export interface CanvasHandle {
  fit(): void;
  zoomBy(factor: number): void;
}

interface Props {
  doc: MapDoc;
  layout: LayoutResult;
  selectedId: string | null;
  editingId: string | null;
  fitKey: number;
  onSelect(id: string | null): void;
  onStartEdit(id: string): void;
  onCommitEdit(id: string, text: string): void;
  onCancelEdit(): void;
  onMove(id: string, newParentId: string): void;
  onToggleCollapse(id: string): void;
}

const PAD_Y = 9;
const MIN_K = 0.15;
const MAX_K = 3;

const Canvas = forwardRef<CanvasHandle, Props>(function Canvas(props, ref) {
  const { doc, layout, selectedId, editingId, fitKey } = props;
  const wrap = useRef<HTMLDivElement>(null);
  const [view, setViewState] = useState<View>({ x: 0, y: 0, k: 1 });
  const viewRef = useRef(view);
  const setView = useCallback((v: View) => {
    viewRef.current = v;
    setViewState(v);
  }, []);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pan = useRef<{ sx: number; sy: number; vx: number; vy: number; moved: boolean } | null>(null);
  const pinch = useRef<{ d: number; k: number; wx: number; wy: number } | null>(null);
  const dragRef = useRef<{ id: string; sx: number; sy: number; active: boolean } | null>(null);
  const lastTap = useRef<{ id: string; t: number } | null>(null);
  const [drag, setDrag] = useState<{ id: string; wx: number; wy: number; target: string | null } | null>(null);

  const size = () => {
    const r = wrap.current!.getBoundingClientRect();
    return { w: r.width, h: r.height, left: r.left, top: r.top };
  };

  const fit = useCallback(() => {
    if (!wrap.current) return;
    const { w, h } = size();
    const b = layout.bounds;
    const k = Math.max(MIN_K, Math.min(1.1, (w - 80) / Math.max(b.w, 1), (h - 120) / Math.max(b.h, 1)));
    setView({ k, x: w / 2 - (b.x + b.w / 2) * k, y: h / 2 - (b.y + b.h / 2) * k });
  }, [layout, setView]);

  const zoomAt = useCallback(
    (factor: number, cx: number, cy: number) => {
      const v = viewRef.current;
      const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor));
      const wx = (cx - v.x) / v.k;
      const wy = (cy - v.y) / v.k;
      setView({ k, x: cx - wx * k, y: cy - wy * k });
    },
    [setView]
  );

  useImperativeHandle(
    ref,
    () => ({
      fit,
      zoomBy: (f: number) => {
        const { w, h } = size();
        zoomAt(f, w / 2, h / 2);
      },
    }),
    [fit, zoomAt]
  );

  useLayoutEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  // roda mouse: Ctrl/Cmd = zoom, selain itu = geser
  useEffect(() => {
    const el = wrap.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(Math.exp(-e.deltaY * 0.0025), e.clientX - r.left, e.clientY - r.top);
      } else {
        const v = viewRef.current;
        setView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt, setView]);

  // pastikan node terpilih tetap terlihat
  useEffect(() => {
    if (!selectedId || !wrap.current || dragRef.current) return;
    const n = layout.nodes[selectedId];
    if (!n) return;
    const { w, h } = size();
    const v = viewRef.current;
    const m = 60;
    const left = n.x * v.k + v.x,
      right = (n.x + n.w) * v.k + v.x,
      top = n.y * v.k + v.y,
      bottom = (n.y + n.h) * v.k + v.y;
    let dx = 0,
      dy = 0;
    if (left < m) dx = m - left;
    else if (right > w - m) dx = w - m - right;
    if (top < m) dy = m - top;
    else if (bottom > h - 130) dy = h - 130 - bottom;
    if (dx || dy) setView({ ...v, x: v.x + dx, y: v.y + dy });
  }, [selectedId, layout, setView]);

  const toWorld = (cx: number, cy: number) => {
    const { left, top } = size();
    const v = viewRef.current;
    return { x: (cx - left - v.x) / v.k, y: (cy - top - v.y) / v.k };
  };

  const hitTest = (wx: number, wy: number, exclude: string): string | null => {
    let best: LNode | null = null;
    for (const id in layout.nodes) {
      if (isDescendant(doc.nodes, exclude, id)) continue;
      const n = layout.nodes[id];
      const m = 8;
      if (wx >= n.x - m && wx <= n.x + n.w + m && wy >= n.y - m && wy <= n.y + n.h + m) {
        if (!best || n.w * n.h < best.w * best.h) best = n;
      }
    }
    return best ? best.id : null;
  };

  const onPointerDown = (e: RPointerEvent) => {
    if (editingId) return;
    const el = e.target as Element;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    wrap.current!.setPointerCapture(e.pointerId);

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const { left, top } = size();
      const v = viewRef.current;
      const mx = (a.x + b.x) / 2 - left,
        my = (a.y + b.y) / 2 - top;
      pinch.current = {
        d: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        k: v.k,
        wx: (mx - v.x) / v.k,
        wy: (my - v.y) / v.k,
      };
      pan.current = null;
      dragRef.current = null;
      setDrag(null);
      return;
    }

    const badge = el.closest("[data-badge]");
    if (badge) {
      const id = badge.getAttribute("data-badge")!;
      props.onToggleCollapse(id);
      return;
    }
    const nodeEl = el.closest("[data-nid]");
    if (nodeEl) {
      const id = nodeEl.getAttribute("data-nid")!;
      props.onSelect(id);
      const isRoot = id === doc.rootId;
      // node biasa bisa di-drag (pindah induk); root hanya menggeser kanvas
      dragRef.current = isRoot ? null : { id, sx: e.clientX, sy: e.clientY, active: false };
      pan.current = isRoot
        ? { sx: e.clientX, sy: e.clientY, vx: viewRef.current.x, vy: viewRef.current.y, moved: false }
        : null;
      lastTapCandidate.current = id;
    } else {
      pan.current = { sx: e.clientX, sy: e.clientY, vx: viewRef.current.x, vy: viewRef.current.y, moved: false };
      lastTapCandidate.current = null;
    }
  };
  const lastTapCandidate = useRef<string | null>(null);

  const onPointerMove = (e: RPointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const { left, top } = size();
      const mx = (a.x + b.x) / 2 - left,
        my = (a.y + b.y) / 2 - top;
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const k = Math.min(MAX_K, Math.max(MIN_K, pinch.current.k * (d / pinch.current.d)));
      setView({ k, x: mx - pinch.current.wx * k, y: my - pinch.current.wy * k });
      return;
    }

    const dr = dragRef.current;
    if (dr) {
      if (!dr.active && Math.hypot(e.clientX - dr.sx, e.clientY - dr.sy) > 6) dr.active = true;
      if (dr.active) {
        const w = toWorld(e.clientX, e.clientY);
        setDrag({ id: dr.id, wx: w.x, wy: w.y, target: hitTest(w.x, w.y, dr.id) });
      }
      return;
    }
    const p = pan.current;
    if (p) {
      const dx = e.clientX - p.sx,
        dy = e.clientY - p.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) p.moved = true;
      setView({ ...viewRef.current, x: p.vx + dx, y: p.vy + dy });
    }
  };

  const onPointerUp = (e: RPointerEvent) => {
    const had = pointers.current.delete(e.pointerId);
    if (!had) return;
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null;
      if (pointers.current.size === 0) {
        pan.current = null;
        dragRef.current = null;
      }
      return;
    }
    const dr = dragRef.current;
    if (dr && dr.active) {
      const w = toWorld(e.clientX, e.clientY);
      const target = hitTest(w.x, w.y, dr.id);
      if (target) props.onMove(dr.id, target);
    } else if (lastTapCandidate.current) {
      // ketukan pada node: ketuk dua kali = edit
      const id = lastTapCandidate.current;
      const now = Date.now();
      const lt = lastTap.current;
      if (lt && lt.id === id && now - lt.t < 400) {
        lastTap.current = null;
        props.onStartEdit(id);
      } else lastTap.current = { id, t: now };
    } else if (pan.current && !pan.current.moved) {
      props.onSelect(null);
    }
    dragRef.current = null;
    pan.current = null;
    lastTapCandidate.current = null;
    setDrag(null);
  };

  // ---------- render ----------
  const edges = useMemo(() => {
    const out: JSX.Element[] = [];
    for (const id of layout.order) {
      const c = layout.nodes[id];
      if (!c.parentId) continue;
      const p = layout.nodes[c.parentId];
      const st = styleFor(doc.nodes, doc.rootId, id, c.depth);
      out.push(
        <path
          key={id}
          d={edgePath(p, c)}
          fill="none"
          stroke={st.branch}
          strokeWidth={c.depth === 1 ? 3 : 2}
          strokeLinecap="round"
          opacity={0.85}
        />
      );
    }
    return out;
  }, [layout, doc.nodes, doc.rootId]);

  const nodeEls = useMemo(() => {
    return layout.order.map((id) => {
      const ln = layout.nodes[id];
      const n = doc.nodes[id];
      const st = styleFor(doc.nodes, doc.rootId, id, ln.depth);
      const selected = id === selectedId;
      const hideText = id === editingId;
      const textY0 = (ln.h - ln.lines.length * ln.lineH) / 2;
      let bx = ln.w + 13,
        by = ln.h / 2;
      if (ln.side === "l") bx = -13;
      else if (ln.side === "d") {
        bx = ln.w / 2;
        by = ln.h + 13;
      }
      return (
        <g key={id} data-nid={id} transform={`translate(${ln.x},${ln.y})`} style={{ cursor: "pointer" }}>
          {st.shape === "line" ? (
            <>
              <rect width={ln.w} height={ln.h} fill="transparent" />
              <line x1={0} y1={ln.h} x2={ln.w} y2={ln.h} stroke={st.stroke} strokeWidth={st.strokeWidth} />
            </>
          ) : (
            <rect
              width={ln.w}
              height={ln.h}
              rx={st.radius(ln.h)}
              fill={st.fill}
              stroke={st.stroke}
              strokeWidth={st.strokeWidth}
            />
          )}
          {!hideText &&
            ln.lines.map((l, i) => (
              <text
                key={i}
                x={ln.w / 2}
                y={textY0 + ln.lineH * (i + 0.5)}
                textAnchor="middle"
                dominantBaseline="central"
                fill={st.text}
                style={{ font: ln.font, userSelect: "none", pointerEvents: "none" }}
              >
                {l}
              </text>
            ))}
          {n.note && <circle cx={ln.w - 4} cy={4} r={4.5} fill="#f59e0b" stroke="#fff" strokeWidth={1.5} />}
          {ln.hasHidden && (
            <g data-badge={id} style={{ cursor: "pointer" }}>
              <circle cx={bx} cy={by} r={10} fill="#fff" stroke={st.branch} strokeWidth={1.5} />
              <text
                x={bx}
                y={by}
                textAnchor="middle"
                dominantBaseline="central"
                fill={st.branch}
                style={{ font: `700 11px system-ui, sans-serif`, pointerEvents: "none" }}
              >
                {n.children.length}
              </text>
            </g>
          )}
          {selected && (
            <rect
              x={-4}
              y={-4}
              width={ln.w + 8}
              height={ln.h + 8}
              rx={st.radius(ln.h) + 4}
              fill="none"
              stroke="#4f46e5"
              strokeWidth={2.5}
              pointerEvents="none"
            />
          )}
        </g>
      );
    });
  }, [layout, doc.nodes, doc.rootId, selectedId, editingId]);

  const ghost = (() => {
    if (!drag) return null;
    const ln = layout.nodes[drag.id];
    if (!ln) return null;
    const st = styleFor(doc.nodes, doc.rootId, drag.id, ln.depth);
    const t = drag.target ? layout.nodes[drag.target] : null;
    return (
      <g pointerEvents="none">
        {t && (
          <rect
            x={t.x - 6}
            y={t.y - 6}
            width={t.w + 12}
            height={t.h + 12}
            rx={14}
            fill="rgba(79,70,229,.12)"
            stroke="#4f46e5"
            strokeWidth={2}
            strokeDasharray="6 4"
          />
        )}
        <g transform={`translate(${drag.wx - ln.w / 2},${drag.wy - ln.h / 2})`} opacity={0.8}>
          <rect
            width={ln.w}
            height={ln.h}
            rx={st.radius(ln.h)}
            fill={st.fill === "none" ? "#fff" : st.fill}
            stroke={st.stroke}
            strokeWidth={2}
          />
          {ln.lines.map((l, i) => (
            <text
              key={i}
              x={ln.w / 2}
              y={(ln.h - ln.lines.length * ln.lineH) / 2 + ln.lineH * (i + 0.5)}
              textAnchor="middle"
              dominantBaseline="central"
              fill={st.fill === "none" ? "#0f172a" : st.text}
              style={{ font: ln.font }}
            >
              {l}
            </text>
          ))}
        </g>
      </g>
    );
  })();

  const editLn = editingId ? layout.nodes[editingId] : null;

  return (
    <div
      ref={wrap}
      className="canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <svg width="100%" height="100%" style={{ display: "block" }}>
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {edges}
          {nodeEls}
          {ghost}
        </g>
      </svg>
      {editLn && editingId && (
        <InlineEditor
          key={editingId}
          ln={editLn}
          view={view}
          initial={doc.nodes[editingId].text}
          onCommit={(t) => props.onCommitEdit(editingId, t)}
          onCancel={props.onCancelEdit}
        />
      )}
    </div>
  );
});

function InlineEditor({
  ln,
  view,
  initial,
  onCommit,
  onCancel,
}: {
  ln: LNode;
  view: View;
  initial: string;
  onCommit(t: string): void;
  onCancel(): void;
}) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  const [val, setVal] = useState(initial);

  useEffect(() => {
    const el = ta.current!;
    el.focus();
    el.select();
  }, []);
  useLayoutEffect(() => {
    const el = ta.current!;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [val, view.k]);

  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (commit) onCommit(val);
    else onCancel();
  };

  const k = view.k;
  const width = Math.max(ln.w, 150) * k;
  const cx = (ln.x + ln.w / 2) * k + view.x;
  const cy = (ln.y + ln.h / 2) * k + view.y;
  return (
    <textarea
      ref={ta}
      className="inline-edit"
      value={val}
      rows={1}
      spellCheck={false}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => finish(true)}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          finish(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          finish(false);
        }
      }}
      style={{
        left: cx - width / 2,
        top: cy - (ln.lines.length * ln.lineH * k) / 2 - PAD_Y * k,
        width,
        fontSize: ln.fontSize * k,
        lineHeight: `${ln.lineH * k}px`,
        padding: `${PAD_Y * k}px ${10 * k}px`,
      }}
    />
  );
}

export default Canvas;
