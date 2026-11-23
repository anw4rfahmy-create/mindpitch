import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { PointerEvent as RPointerEvent } from "react";
import { LayoutResult, LNode } from "./layout";
import { Sheet } from "./types";
import { edgeWidth, radiusFor, styleFor } from "./nodeStyle";
import { isDescendant } from "./model";
import { filesVersion, subscribeFiles, urlOf } from "./files";
import { isRtl } from "./fonts";
import { patternDef, patternId, RegularPattern } from "./patterns";
import { isSketch, sketchGeom } from "./sketch";
import { boundaryRects, CHIP_FONT, CHIP_H, EQ_FONT, GLYPH_FONT, relationGeoms } from "./deco";

interface View {
  x: number;
  y: number;
  k: number;
}

export interface CanvasHandle {
  fit(): void;
  actual(): void;
  focusNode(id: string, k?: number): void;
  zoomBy(factor: number): void;
}

interface Props {
  sheet: Sheet;
  layout: LayoutResult;
  selectedId: string | null;
  selFloat: string | null;
  editingId: string | null;
  fitKey: number;
  multiIds: string[];
  multiMode: boolean;
  onSelect(id: string | null, additive?: boolean): void;
  onSelectFloat(id: string | null): void;
  onStartEdit(id: string): void;
  onCommitEdit(id: string, text: string): void;
  onCancelEdit(): void;
  onMove(id: string, newParentId: string): void;
  onToggleCollapse(id: string): void;
  onFloatChange(id: string, patch: { x?: number; y?: number; w?: number; h?: number }, commit: boolean): void;
  onOpenAttachments(id: string): void;
  selRel?: string | null;
  onSelectRel?(id: string | null): void;
  onDeco?(id: string, kind: string): void;
  pickMode?: boolean;
}

const MIN_K = 0.1;
const MAX_K = 3;

const Canvas = forwardRef<CanvasHandle, Props>(function Canvas(props, ref) {
  const { sheet, layout, selectedId, editingId, fitKey, selFloat, multiIds, multiMode } = props;
  useSyncExternalStore(subscribeFiles, filesVersion);
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
  const floatDrag = useRef<{
    id: string;
    mode: "move" | "resize";
    sx: number;
    sy: number;
    x: number;
    y: number;
    w: number;
    h: number;
    moved: boolean;
  } | null>(null);
  const lastTap = useRef<{ id: string; t: number } | null>(null);
  const lastTapCandidate = useRef<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; wx: number; wy: number; target: string | null } | null>(null);

  const size = () => {
    const r = wrap.current!.getBoundingClientRect();
    return { w: r.width, h: r.height, left: r.left, top: r.top };
  };

  const fit = useCallback(() => {
    if (!wrap.current) return;
    const { w, h } = size();
    const b = layout.bounds;
    const coarse = matchMedia("(pointer: coarse)").matches;
    const fitK = Math.min(1.1, (w - 80) / Math.max(b.w, 1), (h - 130) / Math.max(b.h, 1));
    // di HP jangan mengecil sampai tak terbaca: pakai zoom minimum dan pusatkan pada topik pusat
    const minK = coarse ? 0.55 : MIN_K;
    const k = Math.max(minK, fitK);
    if (k > fitK) {
      const r = layout.nodes[sheet.rootId];
      const cx = r ? r.x + r.w / 2 : b.x + b.w / 2,
        cy = r ? r.y + r.h / 2 : b.y + b.h / 2;
      setView({ k, x: w / 2 - cx * k, y: (h - 40) / 2 - cy * k });
    } else setView({ k, x: w / 2 - (b.x + b.w / 2) * k, y: (h - 40) / 2 - (b.y + b.h / 2) * k });
  }, [layout, sheet.rootId, setView]);

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
      actual: () => {
        const { w, h } = size();
        const v = viewRef.current;
        const wx = (w / 2 - v.x) / v.k,
          wy = (h / 2 - v.y) / v.k;
        setView({ k: 1, x: w / 2 - wx, y: h / 2 - wy });
      },
      focusNode: (id: string, k?: number) => {
        const ln = layout.nodes[id];
        if (!ln) return;
        const { w, h } = size();
        const kk = k ?? Math.max(0.6, viewRef.current.k);
        setView({ k: kk, x: w / 2 - (ln.x + ln.w / 2) * kk, y: (h - 40) / 2 - (ln.y + ln.h / 2) * kk });
      },
    }),
    [fit, zoomAt, layout, setView]
  );

  useLayoutEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  useEffect(() => {
    const el = wrap.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.0025), e.clientX - r.left, e.clientY - r.top);
      else {
        const v = viewRef.current;
        setView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt, setView]);

  // pastikan topik terpilih tetap terlihat
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
      if (isDescendant(sheet.nodes, exclude, id)) continue;
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
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: v.k, wx: (mx - v.x) / v.k, wy: (my - v.y) / v.k };
      pan.current = null;
      dragRef.current = null;
      floatDrag.current = null;
      setDrag(null);
      return;
    }

    const badge = el.closest("[data-badge]");
    if (badge) {
      props.onToggleCollapse(badge.getAttribute("data-badge")!);
      pointers.current.delete(e.pointerId);
      return;
    }
    const clip = el.closest("[data-clip]");
    if (clip) {
      props.onOpenAttachments(clip.getAttribute("data-clip")!);
      pointers.current.delete(e.pointerId);
      return;
    }
    const dc = el.closest("[data-deco]");
    if (dc && props.onDeco) {
      const kind = dc.getAttribute("data-deco")!;
      if (kind === "link" || kind === "audio" || kind === "task") {
        props.onDeco(dc.getAttribute("data-did")!, kind);
        pointers.current.delete(e.pointerId);
        return;
      }
    }
    const relEl = el.closest("[data-rel]");
    if (relEl && props.onSelectRel && !props.pickMode) {
      props.onSelectRel(relEl.getAttribute("data-rel"));
      pointers.current.delete(e.pointerId);
      return;
    }
    const fEl = el.closest("[data-float]");
    if (fEl) {
      const id = fEl.getAttribute("data-float")!;
      const f = sheet.floats.find((x) => x.id === id);
      if (f) {
        props.onSelectFloat(id);
        props.onSelect(null);
        floatDrag.current = {
          id,
          mode: el.closest("[data-fhandle]") ? "resize" : "move",
          sx: e.clientX,
          sy: e.clientY,
          x: f.x,
          y: f.y,
          w: f.w,
          h: f.h,
          moved: false,
        };
        return;
      }
    }
    const nodeEl = el.closest("[data-nid]");
    if (nodeEl) {
      const id = nodeEl.getAttribute("data-nid")!;
      const additive = e.shiftKey || e.ctrlKey || e.metaKey || multiMode;
      props.onSelect(id, additive);
      props.onSelectFloat(null);
      if (additive) {
        pointers.current.delete(e.pointerId);
        return;
      }
      const isRoot = id === sheet.rootId || !!sheet.nodes[id]?.summary;
      dragRef.current = isRoot ? null : { id, sx: e.clientX, sy: e.clientY, active: false };
      pan.current = isRoot ? { sx: e.clientX, sy: e.clientY, vx: viewRef.current.x, vy: viewRef.current.y, moved: false } : null;
      lastTapCandidate.current = id;
    } else {
      pan.current = { sx: e.clientX, sy: e.clientY, vx: viewRef.current.x, vy: viewRef.current.y, moved: false };
      lastTapCandidate.current = null;
    }
  };

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

    const fd = floatDrag.current;
    if (fd) {
      const k = viewRef.current.k;
      const dx = (e.clientX - fd.sx) / k,
        dy = (e.clientY - fd.sy) / k;
      if (Math.abs(dx) + Math.abs(dy) > 2) fd.moved = true;
      if (fd.mode === "move") props.onFloatChange(fd.id, { x: fd.x + dx, y: fd.y + dy }, false);
      else {
        const w = Math.max(30, fd.w + dx);
        props.onFloatChange(fd.id, { w, h: (w / fd.w) * fd.h }, false);
      }
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
    const fd = floatDrag.current;
    if (fd) {
      floatDrag.current = null;
      if (fd.moved) {
        const k = viewRef.current.k;
        const dx = (e.clientX - fd.sx) / k,
          dy = (e.clientY - fd.sy) / k;
        if (fd.mode === "move") props.onFloatChange(fd.id, { x: fd.x + dx, y: fd.y + dy }, true);
        else {
          const w = Math.max(30, fd.w + dx);
          props.onFloatChange(fd.id, { w, h: (w / fd.w) * fd.h }, true);
        }
      }
      return;
    }
    const dr = dragRef.current;
    if (dr && dr.active) {
      const w = toWorld(e.clientX, e.clientY);
      const target = hitTest(w.x, w.y, dr.id);
      if (target) props.onMove(dr.id, target);
    } else if (lastTapCandidate.current) {
      const id = lastTapCandidate.current;
      const now = Date.now();
      const lt = lastTap.current;
      if (lt && lt.id === id && now - lt.t < 400) {
        lastTap.current = null;
        props.onStartEdit(id);
      } else lastTap.current = { id, t: now };
    } else if (pan.current && !pan.current.moved) {
      props.onSelect(null);
      props.onSelectFloat(null);
    }
    dragRef.current = null;
    pan.current = null;
    lastTapCandidate.current = null;
    setDrag(null);
  };

  // ---------- render ----------
  const edges = useMemo(
    () =>
      layout.edges.map((e) => {
        if (e.kind === "axis")
          return (
            <path key={e.key} d={e.d} fill="none" stroke="#334155" strokeWidth={4} strokeLinecap="round" markerEnd="" />
          );
        const owner = layout.nodes[e.childId];
        const depth = e.kind === "brace" ? owner.depth + 1 : owner.depth;
        const color = styleFor(sheet, sheet.nodes[e.kind === "brace" ? e.childId : e.childId], owner.depth).branch;
        return (
          <path
            key={e.key}
            d={e.d}
            fill="none"
            stroke={e.kind === "brace" && e.childId === sheet.rootId ? "#334155" : color}
            strokeWidth={edgeWidth(sheet, depth)}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      }),
    [layout, sheet]
  );

  const nodeEls = useMemo(
    () =>
      layout.order.map((id) => {
        const ln = layout.nodes[id];
        const n = sheet.nodes[id];
        const st = styleFor(sheet, n, ln.depth);
        const hideText = id === editingId;
        const r = radiusFor(st.shape, ln.h);
        const imgUrl = ln.img ? urlOf(ln.img.fileId) : undefined;
        const ac = n.attachments?.length ?? 0;
        return (
          <g key={id} data-nid={id} transform={`translate(${ln.x},${ln.y})`} style={{ cursor: "pointer" }}>
            {st.shape === "line" ? (
              <>
                <rect width={ln.w} height={ln.h} fill="transparent" />
                <line x1={0} y1={ln.h} x2={ln.w} y2={ln.h} stroke={st.stroke} strokeWidth={st.strokeWidth} strokeLinecap="round" />
              </>
            ) : st.shape === "none" ? (
              <rect width={ln.w} height={ln.h} fill="transparent" />
            ) : st.pattern && isSketch(st.pattern) ? (
              (() => {
                const g = sketchGeom(id, st.pattern!, st.shape, ln.w, ln.h, r);
                const cid = "skc-" + id.replace(/[^a-z0-9]/gi, "");
                return (
                  <>
                    <path d={g.fill} fill={st.fill} stroke="none" />
                    {g.hatch && (
                      <>
                        <clipPath id={cid}>
                          <path d={g.fill} />
                        </clipPath>
                        <path d={g.hatch} clipPath={`url(#${cid})`} fill="none" stroke={st.patternColor} strokeWidth={1.8} strokeLinecap="round" pointerEvents="none" />
                      </>
                    )}
                    {st.stroke !== "none" && (
                      <>
                        <path d={g.outline} fill="none" stroke={st.stroke} strokeWidth={st.strokeWidth} strokeDasharray={st.dash} pointerEvents="none" />
                        <path d={g.outline2} fill="none" stroke={st.stroke} strokeWidth={Math.max(1, st.strokeWidth * 0.7)} opacity={0.75} strokeDasharray={st.dash} pointerEvents="none" />
                      </>
                    )}
                  </>
                );
              })()
            ) : st.shape === "ellipse" ? (
              <ellipse cx={ln.w / 2} cy={ln.h / 2} rx={ln.w / 2} ry={ln.h / 2} fill={st.fill} stroke={st.stroke} strokeWidth={st.strokeWidth} strokeDasharray={st.dash} />
            ) : (
              <rect width={ln.w} height={ln.h} rx={r} fill={st.fill} stroke={st.stroke} strokeWidth={st.strokeWidth} strokeDasharray={st.dash} />
            )}
            {st.pattern && !isSketch(st.pattern) && st.shape !== "line" && st.shape !== "none" &&
              (st.shape === "ellipse" ? (
                <ellipse cx={ln.w / 2} cy={ln.h / 2} rx={ln.w / 2} ry={ln.h / 2} fill={`url(#${patternId(st.pattern as RegularPattern, st.patternColor)})`} pointerEvents="none" />
              ) : (
                <rect width={ln.w} height={ln.h} rx={r} fill={`url(#${patternId(st.pattern as RegularPattern, st.patternColor)})`} pointerEvents="none" />
              ))}
            {ln.img && imgUrl && (
              <image href={imgUrl} x={ln.img.x} y={ln.img.y} width={ln.img.w} height={ln.img.h} preserveAspectRatio="xMidYMid slice" pointerEvents="none" />
            )}
            {ln.img && !imgUrl && (
              <rect x={ln.img.x} y={ln.img.y} width={ln.img.w} height={ln.img.h} fill="#e2e8f0" pointerEvents="none" />
            )}
            {!hideText &&
              ln.lines.map((l, i) => (
                <text
                  key={i}
                  x={ln.w / 2}
                  y={ln.textTop + ln.lineH * (i + 0.5)}
                  textAnchor="middle"
                  dominantBaseline="central"
                  direction={ln.rtl ? "rtl" : "ltr"}
                  fill={st.text}
                  style={{ font: ln.font, userSelect: "none", pointerEvents: "none" }}
                >
                  {l}
                </text>
              ))}
            {ln.deco && (
              <g>
                {ln.deco.glyphs.map((g, i) => (
                  <text key={i} data-deco={g.kind} data-did={id} x={g.x} y={ln.deco!.glyphY} textAnchor="middle" dominantBaseline="central" style={{ font: GLYPH_FONT, userSelect: "none", cursor: g.kind === "marker" || g.kind === "sticker" ? "pointer" : "pointer" }}>
                    {g.text}
                  </text>
                ))}
                {ln.deco.chips.map((c, i) => (
                  <g key={"c" + i} pointerEvents="none">
                    <rect x={c.x} y={ln.deco!.chipsY - CHIP_H / 2} width={c.w} height={CHIP_H} rx={CHIP_H / 2} fill="rgba(255,255,255,.92)" stroke="#94a3b8" strokeWidth={0.8} />
                    <text x={c.x + c.w / 2} y={ln.deco!.chipsY} textAnchor="middle" dominantBaseline="central" fill="#334155" style={{ font: CHIP_FONT, userSelect: "none" }}>
                      {c.text}
                    </text>
                  </g>
                ))}
                {ln.deco.eq && (
                  <text x={ln.w / 2} y={ln.deco.eqY} textAnchor="middle" dominantBaseline="central" fill={st.text} pointerEvents="none" style={{ font: EQ_FONT, userSelect: "none" }}>
                    {ln.deco.eq}
                  </text>
                )}
              </g>
            )}
            {n.note && <circle cx={ln.w - 3} cy={3} r={4.5} fill="#f59e0b" stroke="#fff" strokeWidth={1.5} pointerEvents="none" />}
            {ac > 0 && (
              <g data-clip={id} transform={`translate(${ln.w - 2},${ln.h - 2})`} style={{ cursor: "pointer" }}>
                <circle r={9} fill="#fff" stroke="#64748b" strokeWidth={1.3} />
                <path d="M-3.5,1.5 L1,-3.2 a2,2 0 0 1 2.8,2.8 L-1.8,4.4 a3.3,3.3 0 0 1 -4.6,-4.6 L-0.8,-5.8" fill="none" stroke="#475569" strokeWidth={1.2} strokeLinecap="round" transform="scale(.85)" />
                {ac > 1 && (
                  <text x={11} y={-5} fontSize={9} fontWeight={700} fill="#475569" style={{ font: "700 9px system-ui" }}>
                    {ac}
                  </text>
                )}
              </g>
            )}
            {id !== selectedId && multiIds.includes(id) && (
              <rect x={-4} y={-4} width={ln.w + 8} height={ln.h + 8} rx={(st.shape === "ellipse" ? ln.h / 2 : r) + 4} fill="rgba(79,70,229,.08)" stroke="#4f46e5" strokeWidth={2} strokeDasharray="5 3" pointerEvents="none" />
            )}
            {id === selectedId && (
              <rect
                x={-4}
                y={-4}
                width={ln.w + 8}
                height={ln.h + 8}
                rx={(st.shape === "ellipse" ? ln.h / 2 : r) + 4}
                fill="none"
                stroke="#4f46e5"
                strokeWidth={2.5}
                pointerEvents="none"
              />
            )}
          </g>
        );
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout, sheet, selectedId, editingId, multiIds, filesVersion()]
  );

  const boundaries = useMemo(
    () =>
      boundaryRects(sheet, layout).map((b) => (
        <rect key={"b" + b.id} x={b.x} y={b.y} width={b.w} height={b.h} rx={16} fill={b.color} fillOpacity={0.07} stroke={b.color} strokeWidth={1.6} strokeDasharray="7 5" pointerEvents="none" />
      )),
    [layout, sheet]
  );
  const relEls = useMemo(
    () =>
      relationGeoms(sheet, layout).map((r) => {
        const on = r.id === props.selRel;
        return (
          <g key={"r" + r.id} data-rel={r.id} style={{ cursor: "pointer" }}>
            <path d={r.d} fill="none" stroke="transparent" strokeWidth={16} />
            <path d={r.d} fill="none" stroke={on ? "#4f46e5" : r.color} strokeWidth={on ? 3 : 2} strokeDasharray="7 4" strokeLinecap="round" />
            <path d={r.arrow} fill="none" stroke={on ? "#4f46e5" : r.color} strokeWidth={on ? 3 : 2} strokeLinecap="round" strokeLinejoin="round" />
            {r.label && (
              <text x={r.lx} y={r.ly} textAnchor="middle" dominantBaseline="central" fill={r.color} stroke="#fff" strokeWidth={4} paintOrder="stroke" style={{ font: "600 12px system-ui", userSelect: "none" }}>
                {r.label}
              </text>
            )}
          </g>
        );
      }),
    [layout, sheet, props.selRel]
  );

  const patternDefs = useMemo(() => {
    const seen = new Set<string>();
    let out = "";
    for (const id of layout.order) {
      const st = styleFor(sheet, sheet.nodes[id], layout.nodes[id].depth);
      if (!st.pattern || isSketch(st.pattern)) continue;
      const k = patternId(st.pattern as RegularPattern, st.patternColor);
      if (seen.has(k)) continue;
      seen.add(k);
      out += patternDef(st.pattern as RegularPattern, st.patternColor);
    }
    return out;
  }, [layout, sheet]);

  // ukuran tetap di layar (px) agar mudah disentuh di HP, berapa pun zoom-nya
  const coarse = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
  const badgeScale = Math.min(coarse ? 1.7 : 1.35, Math.max(0.8, (coarse ? 0.95 : 0.85) / view.k));
  const badges = layout.order.map((id) => {
    const ln = layout.nodes[id];
    if (!ln.badge || !ln.hasKids) return null;
    const collapsed = ln.hasHidden;
    const color = styleFor(sheet, sheet.nodes[id], ln.depth).branch;
    return (
      <g
        key={id}
        data-badge={id}
        className={"badge" + (collapsed ? " collapsed" : "") + (id === selectedId ? " sel" : "")}
        transform={`translate(${ln.badge.x},${ln.badge.y}) scale(${badgeScale})`}
        style={{ cursor: "pointer" }}
      >
        <circle r={coarse ? 22 : 14} fill="transparent" />
        <circle r={6.5} fill="#fff" stroke={color} strokeWidth={1.6} />
        <path d={collapsed ? "M-3.2,0 H3.2 M0,-3.2 V3.2" : "M-3.2,0 H3.2"} stroke={color} strokeWidth={1.7} strokeLinecap="round" />
      </g>
    );
  });

  const ghost = (() => {
    if (!drag) return null;
    const ln = layout.nodes[drag.id];
    if (!ln) return null;
    const st = styleFor(sheet, sheet.nodes[drag.id], ln.depth);
    const t = drag.target ? layout.nodes[drag.target] : null;
    return (
      <g pointerEvents="none">
        {t && (
          <rect x={t.x - 6} y={t.y - 6} width={t.w + 12} height={t.h + 12} rx={14} fill="rgba(79,70,229,.12)" stroke="#4f46e5" strokeWidth={2} strokeDasharray="6 4" />
        )}
        <g transform={`translate(${drag.wx - ln.w / 2},${drag.wy - ln.h / 2})`} opacity={0.8}>
          <rect width={ln.w} height={ln.h} rx={radiusFor(st.shape, ln.h)} fill={st.fill === "none" ? "#fff" : st.fill} stroke={st.stroke === "none" ? "#94a3b8" : st.stroke} strokeWidth={2} />
          {ln.lines.map((l, i) => (
            <text key={i} x={ln.w / 2} y={ln.textTop + ln.lineH * (i + 0.5)} textAnchor="middle" dominantBaseline="central" fill={st.fill === "none" ? "#0f172a" : st.text} style={{ font: ln.font }}>
              {l}
            </text>
          ))}
        </g>
      </g>
    );
  })();

  const floats = sheet.floats.map((f) => {
    const u = urlOf(f.fileId);
    const sel = f.id === selFloat;
    return (
      <g key={f.id} data-float={f.id} style={{ cursor: "move" }}>
        {u ? <image href={u} x={f.x} y={f.y} width={f.w} height={f.h} preserveAspectRatio="none" /> : <rect x={f.x} y={f.y} width={f.w} height={f.h} fill="#e2e8f0" />}
        {sel && (
          <>
            <rect x={f.x} y={f.y} width={f.w} height={f.h} fill="none" stroke="#4f46e5" strokeWidth={2 / view.k} strokeDasharray={`${6 / view.k} ${4 / view.k}`} pointerEvents="none" />
            <g data-fhandle="1" style={{ cursor: "nwse-resize" }}>
              <rect x={f.x + f.w - 8 / view.k} y={f.y + f.h - 8 / view.k} width={16 / view.k} height={16 / view.k} rx={3 / view.k} fill="#4f46e5" stroke="#fff" strokeWidth={1.5 / view.k} />
            </g>
          </>
        )}
      </g>
    );
  });

  const editLn = editingId ? layout.nodes[editingId] : null;
  const bg = sheet.bg;
  const bgUrl = urlOf(bg.imageId);
  const bgStyle: React.CSSProperties = { backgroundColor: bg.color };
  if (bg.color !== "#fbfcff") bgStyle.backgroundImage = "none";
  if (bgUrl) {
    bgStyle.backgroundImage = `url(${bgUrl})`;
    bgStyle.backgroundSize = bg.fit === "tile" ? "auto" : bg.fit;
    bgStyle.backgroundRepeat = bg.fit === "tile" ? "repeat" : "no-repeat";
    bgStyle.backgroundPosition = "center";
  }

  return (
    <div
      ref={wrap}
      className="canvas"
      style={bgStyle}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <svg width="100%" height="100%" style={{ display: "block" }}>
        <defs dangerouslySetInnerHTML={{ __html: patternDefs }} />
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {floats}
          {boundaries}
          {edges}
          {nodeEls}
          {relEls}
          {ghost}
          <g>{badges}</g>
        </g>
      </svg>
      {editLn && editingId && (
        <InlineEditor
          key={editingId}
          ln={editLn}
          view={view}
          initial={sheet.nodes[editingId].text}
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
  const cy = (ln.y + ln.textTop + (ln.lines.length * ln.lineH) / 2) * k + view.y;
  const rtl = isRtl(val);
  return (
    <textarea
      ref={ta}
      className="inline-edit"
      value={val}
      rows={1}
      dir={rtl ? "rtl" : "ltr"}
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
        top: cy - (ln.lines.length * ln.lineH * k) / 2 - 8 * k,
        width,
        font: ln.font.replace(/\d+(\.\d+)?px/, `${ln.fontSize * k}px`),
        lineHeight: `${ln.lineH * k}px`,
        padding: `${8 * k}px ${10 * k}px`,
      }}
    />
  );
}

export default Canvas;
