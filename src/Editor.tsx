import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Canvas, { CanvasHandle } from "./Canvas";
import Outline from "./Outline";
import PitchPanel from "./PitchPanel";
import SheetBar from "./SheetBar";
import FormatPanel from "./FormatPanel";
import AttachmentViewer from "./AttachmentViewer";
import { computeLayout } from "./layout";
import {
  activeSheet,
  addChild,
  addSibling,
  collectSubtree,
  indent,
  moveNode,
  newSheet,
  outdent,
  removeNode,
  reorder,
  replaceSheet,
  uid,
  updateNode,
  usedFileIds,
} from "./model";
import ExportDialog from "./ExportDialog";
import { deleteFilesExcept, prepareImage, putFile } from "./files";
import { ensureFonts } from "./fonts";
import { Attachment, MNode, Sheet, StructureId, Workbook } from "./types";
import { useDoc } from "./useDoc";

interface Props {
  initial: Workbook;
  onBack(): void;
}

export default function Editor({ initial, onBack }: Props) {
  const { doc, apply, applySheet, undo, redo, canUndo, canRedo, saved } = useDoc(initial);
  const sheet = activeSheet(doc);
  const [selectedId, setSelectedId] = useState<string | null>(sheet.rootId);
  const [multi, setMulti] = useState<string[]>([]);
  const [multiMode, setMultiMode] = useState(false);
  const [selFloat, setSelFloat] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fitKey, setFitKey] = useState(0);
  const [showPitch, setShowPitch] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const [showFormat, setShowFormat] = useState(false);
  const [panelTab, setPanelTab] = useState<"topic" | "map" | "help">("map");
  const [showExport, setShowExport] = useState(false);
  const [attachFor, setAttachFor] = useState<string | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const canvas = useRef<CanvasHandle>(null);
  const imgInput = useRef<HTMLInputElement>(null);
  const floatInput = useRef<HTMLInputElement>(null);
  const bgInput = useRef<HTMLInputElement>(null);
  const docRef = useRef(doc);
  docRef.current = doc;

  const say = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast((t) => (t === m ? null : t)), 2400);
  };

  // pastikan font yang dipakai sudah dimuat, lalu tata ulang
  const [fontTick, setFontTick] = useState(0);
  const fontIds = useMemo(() => {
    const s = new Set<string>([sheet.font]);
    for (const id in sheet.nodes) if (sheet.nodes[id].font) s.add(sheet.nodes[id].font!);
    return [...s].join(",");
  }, [sheet.font, sheet.nodes]);
  useEffect(() => {
    ensureFonts(fontIds.split(",")).then(() => setFontTick((n) => n + 1));
  }, [fontIds]);

  const layout = useMemo(() => computeLayout(sheet), [sheet, fontTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const sel = selectedId && sheet.nodes[selectedId] ? sheet.nodes[selectedId] : null;

  useEffect(() => {
    if (selectedId && !sheet.nodes[selectedId]) setSelectedId(sheet.rootId);
  }, [sheet.nodes, sheet.rootId, selectedId]);

  // bersihkan berkas yatim saat editor ditutup
  useEffect(
    () => () => {
      const d = docRef.current;
      deleteFilesExcept(d.id, usedFileIds(d)).catch(() => {});
    },
    []
  );

  const setNodes = useCallback(
    (fn: (n: Sheet["nodes"]) => Sheet["nodes"], history = true) =>
      applySheet((s) => {
        const nodes = fn(s.nodes);
        return nodes === s.nodes ? s : { ...s, nodes };
      }, history),
    [applySheet]
  );

  // ---------- aksi topik ----------
  const addChildOf = useCallback(
    (id: string, edit = true) => {
      const r = addChild(sheet.nodes, id);
      applySheet((s) => ({ ...s, nodes: r.nodes }));
      setSelectedId(r.id);
      if (edit) setEditingId(r.id);
    },
    [sheet.nodes, applySheet]
  );

  const addSiblingOf = useCallback(
    (id: string, edit = true) => {
      const r = addSibling(sheet.nodes, id);
      if (!r) return addChildOf(id, edit);
      applySheet((s) => ({ ...s, nodes: r.nodes }));
      setSelectedId(r.id);
      if (edit) setEditingId(r.id);
    },
    [sheet.nodes, applySheet, addChildOf]
  );

  const deleteMany = (ids: string[]) => {
    const ok = ids.filter((i) => sheet.nodes[i]?.parentId);
    if (!ok.length) return;
    if (ok.length > 1 && !window.confirm(`Hapus ${ok.length} topik terpilih beserta turunannya?`)) return;
    setNodes((nodes) => ok.reduce((acc, i) => removeNode(acc, i), nodes));
    setSelectedId(sheet.nodes[ok[0]].parentId);
    setMulti([]);
  };

  const deleteNode = useCallback(
    (id: string) => {
      const n = sheet.nodes[id];
      if (!n || !n.parentId) return say("Topik pusat tidak bisa dihapus");
      const count = collectSubtree(sheet.nodes, id).length;
      if (count > 3 && !window.confirm(`Hapus topik ini beserta ${count - 1} turunannya?`)) return;
      const parent = n.parentId;
      setNodes((nodes) => removeNode(nodes, id));
      setSelectedId(parent);
      setEditingId(null);
    },
    [sheet.nodes, setNodes]
  );

  const commitEdit = useCallback(
    (id: string, text: string) => {
      const t = text.trim();
      setEditingId(null);
      if (!t || t === sheet.nodes[id]?.text) return;
      setNodes((nodes) => updateNode(nodes, id, { text: t }));
    },
    [sheet.nodes, setNodes]
  );

  const toggleCollapse = useCallback(
    (id: string) => {
      const n = sheet.nodes[id];
      if (!n || !n.children.length) return;
      setNodes((nodes) => updateNode(nodes, id, { collapsed: !n.collapsed }));
    },
    [sheet.nodes, setNodes]
  );

  const move = useCallback(
    (id: string, target: string) => {
      if (sheet.nodes[id]?.parentId === target) return;
      const next = moveNode(sheet.nodes, id, target);
      if (next !== sheet.nodes) setNodes(() => next);
    },
    [sheet.nodes, setNodes]
  );

  const targets = multi.length > 1 ? multi.filter((id) => sheet.nodes[id]) : sel ? [sel.id] : [];
  const patchSel = (patch: Partial<MNode>) => {
    if (!targets.length) return;
    setNodes((n) => targets.reduce((acc, id) => updateNode(acc, id, patch), n));
  };

  const selectNode = (id: string | null, additive?: boolean) => {
    if (!id) {
      setSelectedId(null);
      setMulti([]);
      return;
    }
    if (additive) {
      const cur = multi.length ? multi : selectedId ? [selectedId] : [];
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      setMulti(next);
      setSelectedId(next.includes(id) ? id : next[next.length - 1] ?? null);
    } else {
      setSelectedId(id);
      setMulti([]);
    }
  };
  const selectSiblings = () => {
    if (!sel || !sel.parentId) return;
    const sibs = sheet.nodes[sel.parentId].children.filter((c) => sheet.nodes[c]);
    setMulti(sibs);
  };

  const setStructure = (st: StructureId) => {
    applySheet((s) => ({ ...s, structure: st }));
    setFitKey((k) => k + 1);
  };

  // ---------- gambar & lampiran ----------
  const pickImage = async (f: File | undefined, kind: "node" | "float" | "bg") => {
    if (!f) return;
    try {
      const { blob, ar } = await prepareImage(f);
      const fileId = await putFile(doc.id, blob, f.name, blob.type || f.type);
      if (kind === "node" && sel) patchSel({ image: { fileId, ar, size: "M" } });
      else if (kind === "bg") applySheet((s) => ({ ...s, bg: { ...s.bg, imageId: fileId, fit: s.bg.fit ?? "cover" } }));
      else if (kind === "float") {
        const w = 240;
        const id = uid();
        const c = layout.bounds;
        applySheet((s) => ({ ...s, floats: [...s.floats, { id, fileId, x: c.x + c.w + 30, y: c.y, w, h: w / ar }] }));
        setSelFloat(id);
        setSelectedId(null);
      }
    } catch (e) {
      say((e as Error).message || "Gagal menambahkan gambar");
    }
  };

  const addAttachments = async (id: string, files: File[]) => {
    const list: Attachment[] = [];
    for (const f of files) {
      try {
        const fid = await putFile(doc.id, f, f.name);
        list.push({ id: fid, name: f.name, mime: f.type || "application/octet-stream", size: f.size });
      } catch {
        say("Gagal menyimpan " + f.name);
      }
    }
    if (list.length) setNodes((n) => updateNode(n, id, { attachments: [...(n[id].attachments ?? []), ...list] }));
  };

  const floatChange = useCallback(
    (id: string, patch: { x?: number; y?: number; w?: number; h?: number }, commit: boolean) => {
      applySheet((s) => ({ ...s, floats: s.floats.map((f) => (f.id === id ? { ...f, ...patch } : f)) }), commit);
    },
    [applySheet]
  );

  // ---------- lembar ----------
  const selectSheet = (id: string) => {
    if (id === doc.activeId) return;
    apply((d) => ({ ...d, activeId: id }), false);
    const s = doc.sheets.find((x) => x.id === id);
    setSelectedId(s ? s.rootId : null);
    setSelFloat(null);
    setEditingId(null);
    setFitKey((k) => k + 1);
  };
  const addSheet = () => {
    const s = newSheet(`Lembar ${doc.sheets.length + 1}`, "Topik utama");
    s.font = sheet.font;
    s.theme = sheet.theme;
    apply((d) => ({ ...d, sheets: [...d.sheets, s], activeId: s.id }));
    setSelectedId(s.rootId);
    setFitKey((k) => k + 1);
  };
  const renameSheet = (id: string, title: string) => apply((d) => replaceSheet(d, id, (s) => ({ ...s, title })));
  const duplicateSheet = (id: string) => {
    const src = doc.sheets.find((s) => s.id === id);
    if (!src) return;
    const copy: Sheet = JSON.parse(JSON.stringify(src));
    copy.id = uid();
    copy.title = src.title + " (2)";
    apply((d) => {
      const i = d.sheets.findIndex((s) => s.id === id);
      const sheets = d.sheets.slice();
      sheets.splice(i + 1, 0, copy);
      return { ...d, sheets, activeId: copy.id };
    });
    setSelectedId(copy.rootId);
    setFitKey((k) => k + 1);
  };
  const deleteSheet = (id: string) => {
    if (doc.sheets.length < 2) return;
    const s = doc.sheets.find((x) => x.id === id);
    if (!window.confirm(`Hapus lembar "${s?.title}"?`)) return;
    apply((d) => {
      const i = d.sheets.findIndex((x) => x.id === id);
      const sheets = d.sheets.filter((x) => x.id !== id);
      const activeId = d.activeId === id ? sheets[Math.min(i, sheets.length - 1)].id : d.activeId;
      return { ...d, sheets, activeId };
    });
    setFitKey((k) => k + 1);
  };
  const moveSheet = (id: string, dir: -1 | 1) =>
    apply((d) => {
      const i = d.sheets.findIndex((x) => x.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.sheets.length) return d;
      const sheets = d.sheets.slice();
      [sheets[i], sheets[j]] = [sheets[j], sheets[i]];
      return { ...d, sheets };
    });

  // pindah lembar karena undo/redo
  useEffect(() => {
    if (selectedId && !sheet.nodes[selectedId]) setSelectedId(sheet.rootId);
  }, [doc.activeId]); // eslint-disable-line

  // ---------- navigasi & pintasan ----------
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showPitch || editingId || attachFor) return;
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
      if (selFloat && (k === "Delete" || k === "Backspace")) {
        e.preventDefault();
        applySheet((s) => ({ ...s, floats: s.floats.filter((f) => f.id !== selFloat) }));
        setSelFloat(null);
        return;
      }
      if (!selectedId) return;
      if (e.altKey) {
        const fnMap: Record<string, (n: Sheet["nodes"]) => Sheet["nodes"]> = {
          ArrowUp: (n) => reorder(n, selectedId, -1),
          ArrowDown: (n) => reorder(n, selectedId, 1),
          ArrowRight: (n) => indent(n, selectedId),
          ArrowLeft: (n) => outdent(n, selectedId),
        };
        if (fnMap[k]) {
          e.preventDefault();
          setNodes(fnMap[k]);
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
          multi.length > 1 ? deleteMany(multi) : deleteNode(selectedId);
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
          setMulti([]);
          setMultiMode(false);
          setSelFloat(null);
          setShowExport(false);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showPitch, editingId, attachFor, selectedId, selFloat, multi, applySheet, setNodes, undo, redo, addChildOf, addSiblingOf, deleteNode, toggleCollapse, navigate]);

  const [title, setTitle] = useState(doc.title);
  useEffect(() => setTitle(doc.title), [doc.title]);
  const commitTitle = () => {
    const t = title.trim();
    if (!t || t === doc.title) return setTitle(doc.title);
    apply((d) => ({ ...d, title: t }));
  };

  const topicCount = Object.keys(layout.nodes).length;
  const totalTopics = Object.keys(sheet.nodes).length;
  const attachNode = attachFor ? sheet.nodes[attachFor] : null;

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
        <button className={"btn" + (showOutline ? " active" : "")} onClick={() => setShowOutline((v) => !v)}>
          ☰ <span className="hide-sm">Outline</span>
        </button>
        <button className={"btn" + (showFormat && panelTab !== "help" ? " active" : "")} onClick={() => (showFormat && panelTab !== "help" ? setShowFormat(false) : (setShowFormat(true), setPanelTab(sel ? "topic" : "map")))}>
          🎨 <span className="hide-sm">Format</span>
        </button>
        <button className={"btn icon" + (showFormat && panelTab === "help" ? " active" : "")} title="Panduan tombol" aria-label="Panduan" onClick={() => (showFormat && panelTab === "help" ? setShowFormat(false) : (setShowFormat(true), setPanelTab("help")))}>
          ?
        </button>
        <button className="btn" onClick={() => setShowExport(true)}>
          ⬇ <span className="hide-sm">Ekspor</span>
        </button>
        <button className="btn primary" onClick={() => setShowPitch(true)}>
          🎬 Pitch
        </button>
      </header>

      <div className="workspace">
        {showOutline && (
          <aside className="side outline-side">
            <Outline
              sheet={sheet}
              selectedId={selectedId}
              focusToken={focusToken}
              onSelect={(id) => setSelectedId(id)}
              onRename={(id, text) => commitEdit(id, text)}
              onAddSibling={(id) => {
                const r = addSibling(sheet.nodes, id) ?? addChild(sheet.nodes, id);
                applySheet((s) => ({ ...s, nodes: r.nodes }));
                setSelectedId(r.id);
                setFocusToken((n) => n + 1);
              }}
              onIndent={(id) => {
                setNodes((n) => indent(n, id));
                setFocusToken((x) => x + 1);
              }}
              onOutdent={(id) => {
                setNodes((n) => outdent(n, id));
                setFocusToken((x) => x + 1);
              }}
              onDelete={(id) => deleteNode(id)}
            />
          </aside>
        )}

        <div className="canvas-col">
          <div className="canvas-area">
            <Canvas
              ref={canvas}
              sheet={sheet}
              layout={layout}
              selectedId={selectedId}
              selFloat={selFloat}
              editingId={editingId}
              fitKey={fitKey}
              onSelect={selectNode}
              multiIds={multi}
              multiMode={multiMode}
              onSelectFloat={setSelFloat}
              onStartEdit={setEditingId}
              onCommitEdit={commitEdit}
              onCancelEdit={() => setEditingId(null)}
              onMove={move}
              onToggleCollapse={toggleCollapse}
              onFloatChange={floatChange}
              onOpenAttachments={setAttachFor}
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
                {sel?.collapsed ? "⊕ Buka" : "⊖ Lipat"}
              </button>
              <button className="btn" disabled={!sel} onClick={() => sel && setAttachFor(sel.id)} title="Lampiran">
                📎{sel?.attachments?.length ? ` ${sel.attachments.length}` : ""}
              </button>
              <button className="btn" disabled={!sel} onClick={() => imgInput.current?.click()} title="Gambar pada topik">
                🖼
              </button>
              <button className={"btn" + (multiMode || multi.length > 1 ? " active" : "")} onClick={() => setMultiMode((v) => !v)} title="Pilih banyak topik (atau tahan Shift/Ctrl lalu klik)">
                ☑{multi.length > 1 ? ` ${multi.length}` : ""}
              </button>
              <button className="btn" disabled={!sel || !sel.parentId} onClick={selectSiblings} title="Pilih semua saudara">
                ⫴ Saudara
              </button>
              <button className="btn danger" disabled={!sel || !sel.parentId} onClick={() => (multi.length > 1 ? deleteMany(multi) : sel && deleteNode(sel.id))}>
                🗑
              </button>
            </div>
            {toast && <div className="toast">{toast}</div>}
          </div>
          <SheetBar
            sheets={doc.sheets}
            activeId={doc.activeId}
            topicCount={topicCount === totalTopics ? totalTopics : topicCount}
            onSelect={selectSheet}
            onAdd={addSheet}
            onRename={renameSheet}
            onDuplicate={duplicateSheet}
            onDelete={deleteSheet}
            onMove={moveSheet}
          />
        </div>

        {showFormat && (
          <FormatPanel
            key={doc.activeId}
            sheet={sheet}
            sel={sel}
            count={Math.max(1, targets.length)}
            tab={panelTab}
            onTab={setPanelTab}
            selFloat={selFloat}
            onSheet={(fn) => applySheet(fn)}
            onNodes={(fn) => setNodes(fn)}
            onPatch={patchSel}
            onStructure={setStructure}
            onPickNodeImage={() => imgInput.current?.click()}
            onPickFloat={() => floatInput.current?.click()}
            onPickBg={() => bgInput.current?.click()}
            onDeleteFloat={(id) => {
              applySheet((s) => ({ ...s, floats: s.floats.filter((f) => f.id !== id) }));
              setSelFloat(null);
            }}
            onOpenAttach={() => sel && setAttachFor(sel.id)}
            onAttachFiles={(f) => sel && addAttachments(sel.id, f)}
            onClose={() => setShowFormat(false)}
          />
        )}
      </div>

      {(["node", "float", "bg"] as const).map((k) => (
        <input
          key={k}
          ref={k === "node" ? imgInput : k === "float" ? floatInput : bgInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            pickImage(f, k);
          }}
        />
      ))}

      {attachFor && attachNode && (
        <AttachmentViewer
          title={attachNode.text.split("\n")[0].slice(0, 40)}
          items={attachNode.attachments ?? []}
          onAdd={(fs) => addAttachments(attachFor, fs)}
          onRemove={(id) =>
            setNodes((n) => updateNode(n, attachFor, { attachments: (n[attachFor].attachments ?? []).filter((a) => a.id !== id) }))
          }
          onClose={() => setAttachFor(null)}
        />
      )}

      {showExport && <ExportDialog wb={doc} sheet={sheet} onClose={() => setShowExport(false)} onDone={say} />}
      {showPitch && <PitchPanel wb={doc} sheet={sheet} startId={selectedId} applySheet={applySheet} onClose={() => setShowPitch(false)} />}
    </div>
  );
}
