import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Canvas, { CanvasHandle } from "./Canvas";
import Outline from "./Outline";
import PitchPanel from "./PitchPanel";
import { computeLayout } from "./layout";
import {
  addChild,
  addSibling,
  collectSubtree,
  indent,
  layoutLabel,
  moveNode,
  outdent,
  removeNode,
  reorder,
  updateNode,
} from "./model";
import { NODE_COLORS } from "./nodeStyle";
import { download, safeName, svgToPng, toJSON, toMarkdown, toSvg } from "./exporters";
import { LayoutKind, MapDoc, NodeShape } from "./types";
import { useDoc } from "./useDoc";

interface Props {
  initial: MapDoc;
  onBack(): void;
}

const SHAPES: [NodeShape, string][] = [
  ["rounded", "Bulat"],
  ["pill", "Pil"],
  ["box", "Kotak"],
  ["line", "Garis"],
];

export default function Editor({ initial, onBack }: Props) {
  const { doc, apply, undo, redo, canUndo, canRedo, saved } = useDoc(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initial.rootId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fitKey, setFitKey] = useState(0);
  const [showPitch, setShowPitch] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const [showInspector, setShowInspector] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [focusToken, setFocusToken] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const canvas = useRef<CanvasHandle>(null);

  const layout = useMemo(() => computeLayout(doc.nodes, doc.rootId, doc.layout), [doc.nodes, doc.rootId, doc.layout]);
  const sel = selectedId && doc.nodes[selectedId] ? doc.nodes[selectedId] : null;

  const say = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast((t) => (t === m ? null : t)), 2200);
  };

  // pastikan pilihan valid setelah undo/hapus
  useEffect(() => {
    if (selectedId && !doc.nodes[selectedId]) setSelectedId(doc.rootId);
  }, [doc.nodes, doc.rootId, selectedId]);

  // ---------- aksi ----------
  const addChildOf = useCallback(
    (id: string, edit = true) => {
      const r = addChild(doc.nodes, id);
      apply((d) => ({ ...d, nodes: r.nodes }));
      setSelectedId(r.id);
      if (edit) setEditingId(r.id);
    },
    [doc.nodes, apply]
  );

  const addSiblingOf = useCallback(
    (id: string, edit = true) => {
      const r = addSibling(doc.nodes, id);
      if (!r) return addChildOf(id, edit);
      apply((d) => ({ ...d, nodes: r.nodes }));
      setSelectedId(r.id);
      if (edit) setEditingId(r.id);
    },
    [doc.nodes, apply, addChildOf]
  );

  const deleteNode = useCallback(
    (id: string) => {
      const n = doc.nodes[id];
      if (!n || !n.parentId) return say("Topik pusat tidak bisa dihapus");
      const count = collectSubtree(doc.nodes, id).length;
      if (count > 3 && !window.confirm(`Hapus topik ini beserta ${count - 1} turunannya?`)) return;
      const parent = n.parentId;
      apply((d) => ({ ...d, nodes: removeNode(d.nodes, id) }));
      setSelectedId(parent);
      setEditingId(null);
    },
    [doc.nodes, apply]
  );

  const commitEdit = useCallback(
    (id: string, text: string) => {
      const t = text.trim();
      setEditingId(null);
      if (!t || t === doc.nodes[id]?.text) return;
      apply((d) => {
        const nodes = updateNode(d.nodes, id, { text: t });
        return { ...d, nodes, title: id === d.rootId ? t : d.title };
      });
    },
    [doc.nodes, apply]
  );

  const toggleCollapse = useCallback(
    (id: string) => {
      const n = doc.nodes[id];
      if (!n || !n.children.length) return;
      apply((d) => ({ ...d, nodes: updateNode(d.nodes, id, { collapsed: !n.collapsed }) }));
    },
    [doc.nodes, apply]
  );

  const move = useCallback(
    (id: string, target: string) => {
      if (doc.nodes[id]?.parentId === target) return;
      const next = moveNode(doc.nodes, id, target);
      if (next === doc.nodes) return;
      apply((d) => ({ ...d, nodes: next }));
    },
    [doc.nodes, apply]
  );

  const patchSel = (patch: Partial<NonNullable<typeof sel>>) => {
    if (!sel) return;
    apply((d) => ({ ...d, nodes: updateNode(d.nodes, sel.id, patch) }));
  };

  const setLayout = (l: LayoutKind) => {
    apply((d) => ({ ...d, layout: l }));
    setFitKey((k) => k + 1);
  };

  // navigasi spasial dengan panah
  const navigate = useCallback(
    (key: string) => {
      if (!selectedId) return;
      const cur = layout.nodes[selectedId];
      if (!cur) return;
      const cx = cur.x + cur.w / 2,
        cy = cur.y + cur.h / 2;
      let best: string | null = null,
        bestScore = Infinity;
      for (const id in layout.nodes) {
        if (id === selectedId) continue;
        const n = layout.nodes[id];
        const dx = n.x + n.w / 2 - cx,
          dy = n.y + n.h / 2 - cy;
        let primary: number, secondary: number;
        if (key === "ArrowRight") [primary, secondary] = [dx, dy];
        else if (key === "ArrowLeft") [primary, secondary] = [-dx, dy];
        else if (key === "ArrowDown") [primary, secondary] = [dy, dx];
        else [primary, secondary] = [-dy, dx];
        if (primary <= 4) continue;
        const score = primary + Math.abs(secondary) * 2.2;
        if (score < bestScore) {
          bestScore = score;
          best = id;
        }
      }
      if (best) setSelectedId(best);
    },
    [layout, selectedId]
  );

  // ---------- pintasan keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showPitch || editingId) return;
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key;

      if (mod && k.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if (mod && k.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && k === "0") {
        e.preventDefault();
        canvas.current?.fit();
        return;
      }
      if (mod && (k === "=" || k === "+")) {
        e.preventDefault();
        canvas.current?.zoomBy(1.2);
        return;
      }
      if (mod && k === "-") {
        e.preventDefault();
        canvas.current?.zoomBy(1 / 1.2);
        return;
      }
      if (mod) return;
      if (!selectedId) return;

      if (e.altKey) {
        if (k === "ArrowUp" || k === "ArrowDown") {
          e.preventDefault();
          const n = reorder(doc.nodes, selectedId, k === "ArrowUp" ? -1 : 1);
          if (n !== doc.nodes) apply((d) => ({ ...d, nodes: n }));
        } else if (k === "ArrowRight") {
          e.preventDefault();
          const n = indent(doc.nodes, selectedId);
          if (n !== doc.nodes) apply((d) => ({ ...d, nodes: n }));
        } else if (k === "ArrowLeft") {
          e.preventDefault();
          const n = outdent(doc.nodes, selectedId);
          if (n !== doc.nodes) apply((d) => ({ ...d, nodes: n }));
        }
        return;
      }

      switch (k) {
        case "Tab":
          e.preventDefault();
          addChildOf(selectedId);
          break;
        case "Enter":
          e.preventDefault();
          addSiblingOf(selectedId);
          break;
        case "F2":
          e.preventDefault();
          setEditingId(selectedId);
          break;
        case "Delete":
        case "Backspace":
          e.preventDefault();
          deleteNode(selectedId);
          break;
        case " ":
          e.preventDefault();
          toggleCollapse(selectedId);
          break;
        case "ArrowUp":
        case "ArrowDown":
        case "ArrowLeft":
        case "ArrowRight":
          e.preventDefault();
          navigate(k);
          break;
        case "Escape":
          setSelectedId(null);
          setShowExport(false);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showPitch, editingId, selectedId, doc.nodes, apply, undo, redo, addChildOf, addSiblingOf, deleteNode, toggleCollapse, navigate]);

  // ---------- ekspor ----------
  const doExport = async (kind: "png" | "svg" | "json" | "md") => {
    setShowExport(false);
    const name = safeName(doc.title);
    try {
      if (kind === "json") download(new Blob([toJSON(doc)], { type: "application/json" }), `${name}.json`);
      else if (kind === "md") download(new Blob([toMarkdown(doc)], { type: "text/markdown" }), `${name}.md`);
      else {
        const { svg, w, h } = toSvg(doc);
        if (kind === "svg") download(new Blob([svg], { type: "image/svg+xml" }), `${name}.svg`);
        else download(await svgToPng(svg, w, h, 2), `${name}.png`);
      }
      say("Berhasil diekspor");
    } catch {
      say("Gagal mengekspor");
    }
  };

  // judul
  const [title, setTitle] = useState(doc.title);
  useEffect(() => setTitle(doc.title), [doc.title]);
  const commitTitle = () => {
    const t = title.trim();
    if (!t || t === doc.title) return setTitle(doc.title);
    apply((d) => ({ ...d, title: t, nodes: updateNode(d.nodes, d.rootId, { text: t }) }));
  };

  // catatan
  const [note, setNote] = useState("");
  useEffect(() => setNote(sel?.note ?? ""), [sel?.id, sel?.note]);

  return (
    <div className="editor">
      <header className="topbar">
        <button className="btn icon" onClick={onBack} aria-label="Kembali">
          ←
        </button>
        <input
          className="title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        />
        <span className="save-state small muted">{saved ? "Tersimpan" : "Menyimpan…"}</span>
        <div className="spacer" />
        <button className="btn icon" disabled={!canUndo} onClick={undo} title="Urungkan (Ctrl+Z)">
          ↶
        </button>
        <button className="btn icon" disabled={!canRedo} onClick={redo} title="Ulangi (Ctrl+Y)">
          ↷
        </button>
        <select
          className="select layout-select"
          value={doc.layout}
          onChange={(e) => setLayout(e.target.value as LayoutKind)}
          title="Tata letak"
        >
          {(["map", "right", "down"] as LayoutKind[]).map((l) => (
            <option key={l} value={l}>
              {layoutLabel(l)}
            </option>
          ))}
        </select>
        <button className={"btn" + (showOutline ? " active" : "")} onClick={() => setShowOutline((v) => !v)}>
          ☰ <span className="hide-sm">Outline</span>
        </button>
        <div className="menu-wrap">
          <button className="btn" onClick={() => setShowExport((v) => !v)}>
            ⬇ <span className="hide-sm">Ekspor</span>
          </button>
          {showExport && (
            <div className="menu" onMouseLeave={() => setShowExport(false)}>
              <button onClick={() => doExport("png")}>Gambar PNG</button>
              <button onClick={() => doExport("svg")}>Gambar SVG</button>
              <button onClick={() => doExport("md")}>Markdown (.md)</button>
              <button onClick={() => doExport("json")}>Cadangan JSON</button>
            </div>
          )}
        </div>
        <button className="btn primary" onClick={() => setShowPitch(true)}>
          🎬 Pitch
        </button>
      </header>

      <div className="workspace">
        {showOutline && (
          <aside className="side outline-side">
            <Outline
              doc={doc}
              selectedId={selectedId}
              focusToken={focusToken}
              onSelect={(id) => setSelectedId(id)}
              onRename={(id, text) => commitEdit(id, text)}
              onAddSibling={(id) => {
                const r = addSibling(doc.nodes, id) ?? addChild(doc.nodes, id);
                apply((d) => ({ ...d, nodes: r.nodes }));
                setSelectedId(r.id);
                setFocusToken((n) => n + 1);
              }}
              onIndent={(id) => {
                const n = indent(doc.nodes, id);
                if (n !== doc.nodes) apply((d) => ({ ...d, nodes: n }));
                setFocusToken((x) => x + 1);
              }}
              onOutdent={(id) => {
                const n = outdent(doc.nodes, id);
                if (n !== doc.nodes) apply((d) => ({ ...d, nodes: n }));
                setFocusToken((x) => x + 1);
              }}
              onDelete={(id) => deleteNode(id)}
            />
          </aside>
        )}

        <div className="canvas-area">
          <Canvas
            ref={canvas}
            doc={doc}
            layout={layout}
            selectedId={selectedId}
            editingId={editingId}
            fitKey={fitKey}
            onSelect={setSelectedId}
            onStartEdit={setEditingId}
            onCommitEdit={commitEdit}
            onCancelEdit={() => setEditingId(null)}
            onMove={move}
            onToggleCollapse={toggleCollapse}
          />

          <div className="zoom-box">
            <button className="btn icon" onClick={() => canvas.current?.zoomBy(1.25)} aria-label="Perbesar">
              +
            </button>
            <button className="btn icon" onClick={() => canvas.current?.zoomBy(0.8)} aria-label="Perkecil">
              −
            </button>
            <button className="btn icon" onClick={() => canvas.current?.fit()} aria-label="Pas layar" title="Pas layar">
              ⤢
            </button>
          </div>

          <div className="actionbar">
            <button className="btn" disabled={!sel} onClick={() => sel && addChildOf(sel.id)}>
              ＋ Anak
            </button>
            <button className="btn" disabled={!sel || !sel.parentId} onClick={() => sel && addSiblingOf(sel.id)}>
              ＋ Saudara
            </button>
            <button className="btn" disabled={!sel} onClick={() => sel && setEditingId(sel.id)}>
              ✎ Ubah
            </button>
            <button className="btn" disabled={!sel || !sel.children.length} onClick={() => sel && toggleCollapse(sel.id)}>
              {sel?.collapsed ? "▸ Buka" : "▾ Lipat"}
            </button>
            <button className="btn danger" disabled={!sel || !sel.parentId} onClick={() => sel && deleteNode(sel.id)}>
              🗑
            </button>
            <button className={"btn" + (showInspector ? " active" : "")} onClick={() => setShowInspector((v) => !v)}>
              🎨
            </button>
          </div>

          {toast && <div className="toast">{toast}</div>}
        </div>

        {showInspector && sel && (
          <aside className="side inspector">
            <div className="insp-head">
              <b>Gaya topik</b>
              <button className="btn icon small" onClick={() => setShowInspector(false)}>
                ✕
              </button>
            </div>
            <div className="field">
              <span>Warna</span>
              <div className="swatches">
                {NODE_COLORS.map((c) => (
                  <button
                    key={c}
                    className={"swatch" + (sel.color === c ? " on" : "")}
                    style={{ background: c }}
                    onClick={() => patchSel({ color: c })}
                    aria-label={c}
                  />
                ))}
                <button className="swatch reset" onClick={() => patchSel({ color: undefined })} title="Warna otomatis">
                  ⟲
                </button>
              </div>
            </div>
            <div className="field">
              <span>Bentuk</span>
              <div className="seg">
                {SHAPES.map(([v, l]) => (
                  <button
                    key={v}
                    className={(sel.shape ?? (sel.parentId ? "rounded" : "pill")) === v ? "on" : ""}
                    onClick={() => patchSel({ shape: v })}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span>Urutan</span>
              <div className="seg">
                <button onClick={() => apply((d) => ({ ...d, nodes: reorder(d.nodes, sel.id, -1) }))}>↑ Naik</button>
                <button onClick={() => apply((d) => ({ ...d, nodes: reorder(d.nodes, sel.id, 1) }))}>↓ Turun</button>
                <button onClick={() => apply((d) => ({ ...d, nodes: outdent(d.nodes, sel.id) }))}>⇤</button>
                <button onClick={() => apply((d) => ({ ...d, nodes: indent(d.nodes, sel.id) }))}>⇥</button>
              </div>
            </div>
            <label className="field">
              <span>Catatan (juga jadi catatan pembicara di Pitch)</span>
              <textarea
                className="note-input"
                rows={5}
                value={note}
                placeholder="Tulis catatan…"
                onChange={(e) => setNote(e.target.value)}
                onBlur={() => note !== (sel.note ?? "") && patchSel({ note: note || undefined })}
              />
            </label>
          </aside>
        )}
      </div>

      {showPitch && <PitchPanel doc={doc} apply={apply} onClose={() => setShowPitch(false)} />}
    </div>
  );
}
