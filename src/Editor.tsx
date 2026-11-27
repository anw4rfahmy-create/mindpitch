import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Canvas, { CanvasHandle } from "./Canvas";
import Outline from "./Outline";
import PitchPanel from "./PitchPanel";
import TableEditor from "./TableEditor";
import TablePresenter from "./TablePresenter";
import VennEditor from "./VennEditor";
import VennPresenter from "./VennPresenter";
import MapPresenter from "./MapPresenter";
import { TABLE_TEMPLATES, TableTemplate, mapToTable } from "./table";
import { importFile as importAny } from "./exporters";
import SheetBar from "./SheetBar";
import FormatPanel from "./FormatPanel";
import AttachmentViewer from "./AttachmentViewer";
import InsertDialog, { InsertKind } from "./InsertDialogs";
import ShortcutsDialog from "./ShortcutsDialog";
import { comboOf, findAction, loadShortcuts, saveShortcuts } from "./shortcuts";
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
  addSummary,
  newTableSheet, newVennSheet,
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
  const [showMapPres, setShowMapPres] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const [showFormat, setShowFormat] = useState(false);
  const [panelTab, setPanelTab] = useState<"topic" | "map" | "keys" | "help">("map");
  const [showExport, setShowExport] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [attachFor, setAttachFor] = useState<string | null>(null);
  const [attachCell, setAttachCell] = useState<string | null>(null); // "r,c" pada lembar tabel
  const [tapAttach, setTapAttach] = useState(() => {
    try {
      return localStorage.getItem("mapit-tap-attach") !== "0";
    } catch {
      return true;
    }
  });
  const changeTapAttach = (v: boolean) => {
    setTapAttach(v);
    try {
      localStorage.setItem("mapit-tap-attach", v ? "1" : "0");
    } catch {
      /* abaikan */
    }
  };
  const [focusToken, setFocusToken] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [insertKind, setInsertKind] = useState<InsertKind | null>(null);
  const [relFrom, setRelFrom] = useState<string | null>(null);
  const [selRel, setSelRel] = useState<string | null>(null);
  const [relEdit, setRelEdit] = useState(false);
  const [zen, setZen] = useState(false);
  const [tblTools, setTblTools] = useState(() => !(typeof matchMedia !== "undefined" && matchMedia("(max-width: 720px)").matches));
  const [menu, setMenu] = useState<{ kind: "ins" | "link"; x: number; y: number } | null>(null);
  const [scMap, setScMap] = useState(loadShortcuts);
  const [showSc, setShowSc] = useState(false);
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
      if (sheet.nodes[id]?.summary) return;
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
    const ok = ids.filter((i) => sheet.nodes[i]?.parentId || sheet.nodes[i]?.summary);
    if (!ok.length) return;
    if (ok.length > 1 && !window.confirm(`Hapus ${ok.length} topik terpilih beserta turunannya?`)) return;
    setNodes((nodes) => ok.reduce((acc, i) => removeNode(acc, i), nodes));
    setSelectedId(sheet.nodes[ok[0]].parentId);
    setMulti([]);
  };

  const deleteNode = useCallback(
    (id: string) => {
      const n = sheet.nodes[id];
      if (n?.summary) {
        setNodes((nodes) => removeNode(nodes, id));
        setSelectedId(null);
        return;
      }
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
    if (relFrom && id) {
      if (id !== relFrom) {
        const rid = uid();
        applySheet((sh) => ({ ...sh, relations: [...(sh.relations ?? []), { id: rid, from: relFrom, to: id }] }));
        setSelRel(rid);
        setSelectedId(null);
        say("Hubungan dibuat. Ketuk garisnya untuk memberi teks atau menghapus.");
      }
      setRelFrom(null);
      return;
    }
    setSelRel(null);
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
  const startRelation = () => {
    if (!selectedId) return say("Pilih topik asal dulu, lalu ketuk Hubungan");
    setRelFrom(selectedId);
    setSelRel(null);
  };
  const toggleBoundary = () => {
    if (!targets.length) return say("Pilih topik yang ingin dibatasi");
    const on = targets.every((t) => sheet.nodes[t]?.boundary);
    patchSel({ boundary: on ? undefined : true });
  };
  const openInsert = (k: InsertKind) => {
    setMenu(null);
    if (k !== "marker" && !sel) return say("Pilih topik dulu");
    if (k === "marker" && !sel) return say("Pilih topik dulu");
    setInsertKind(k);
  };
  const onDeco = (id: string, kind: string) => {
    const n = sheet.nodes[id];
    if (!n) return;
    setSelectedId(id);
    if (kind === "task") setNodes((m) => updateNode(m, id, { task: (n.task ?? 0) >= 100 ? 0 : 100 }));
    else if (kind === "audio") setInsertKind("audio");
    else if (kind === "link" && n.link) {
      if (n.link.kind === "web") window.open(n.link.target, "_blank", "noopener");
      else if (n.link.kind === "node") {
        if (sheet.nodes[n.link.target]) {
          setSelectedId(n.link.target);
          canvas.current?.focusNode(n.link.target);
        } else say("Topik tujuan sudah dihapus");
      } else if (docRef.current.sheets.some((x) => x.id === n.link!.target)) selectSheet(n.link.target);
      else say("Lembar tujuan sudah dihapus");
    }
  };
  const makeSummary = () => {
    const ids = multi.length > 1 ? multi : selectedId ? [selectedId] : [];
    const r = addSummary(sheet.nodes, ids);
    if (!r) return say("Pilih topik (satu induk yang sama) untuk diringkas");
    applySheet((s) => ({ ...s, nodes: r.nodes }));
    setMulti([]);
    setSelectedId(r.id);
    setEditingId(r.id);
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

  const setCellAtt = (key: string, fn: (list: Attachment[]) => Attachment[]) =>
    applySheet((sh) => {
      const t = sh.table!;
      const cur = t.style[key] ?? {};
      const att = fn(cur.att ?? []);
      return { ...sh, table: { ...t, style: { ...t.style, [key]: { ...cur, att: att.length ? att : undefined } } } };
    });
  const addCellAttachments = async (key: string, files: File[]) => {
    const list: Attachment[] = [];
    for (const f of files) {
      try {
        const fid = await putFile(doc.id, f, f.name);
        list.push({ id: fid, name: f.name, mime: f.type || "application/octet-stream", size: f.size });
      } catch {
        say("Gagal menyimpan " + f.name);
      }
    }
    if (list.length) setCellAtt(key, (l) => [...l, ...list]);
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
  const addSheet = () => setShowNew(true);
  const addTableSheet = (tpl: TableTemplate) => {
    const name = TABLE_TEMPLATES.find((x) => x.id === tpl)!.title;
    const s = newTableSheet(tpl === "blank" ? `Tabel ${doc.sheets.length + 1}` : name, tpl);
    apply((d) => ({ ...d, sheets: [...d.sheets, s], activeId: s.id }));
    setSelectedId(null);
    setShowNew(false);
  };
  const addVennSheet = () => {
    const s = newVennSheet(`Venn ${doc.sheets.length + 1}`);
    apply((d) => ({ ...d, sheets: [...d.sheets, s], activeId: s.id }));
    setSelectedId(null);
    setShowNew(false);
  };
  const addMapSheet = () => {
    setShowNew(false);
    const s = newSheet(`Lembar ${doc.sheets.length + 1}`, "Topik utama");
    s.font = sheet.font;
    s.theme = sheet.theme;
    apply((d) => ({ ...d, sheets: [...d.sheets, s], activeId: s.id }));
    setSelectedId(s.rootId);
    setFitKey((k) => k + 1);
  };
  const mapToTableSheet = (mode: "path" | "branch") => {
    const t = mapToTable(sheet, mode);
    if (!t) return say("Peta kosong, tidak bisa dijadikan tabel");
    const s = newTableSheet(`${sheet.title} (tabel)`, "blank");
    s.table = t;
    apply((d) => ({ ...d, sheets: [...d.sheets, s], activeId: s.id }));
    setSelectedId(null);
  };
  const importSheets = async (f: File) => {
    const imp = await importAny(f, doc.id);
    if (!imp || !imp.sheets.length) return say("Berkas tidak dikenali (.mapit, peta lintas aplikasi, .json, .md, .txt, .csv, .tsv)");
    const added = imp.sheets.map((x) => ({ ...x, id: uid() }));
    setShowNew(false);
    apply((d) => ({ ...d, sheets: [...d.sheets, ...added], activeId: added[0].id }));
    setSelectedId(added[0].table || added[0].venn ? null : added[0].rootId);
    setFitKey((k) => k + 1);
    say(`${added.length} lembar diimpor`);
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
  const reorderSheet = (id: string, to: number) =>
    apply((d) => {
      const i = d.sheets.findIndex((x) => x.id === id);
      if (i < 0 || to < 0 || to >= d.sheets.length || i === to) return d;
      const sheets = d.sheets.slice();
      const [m] = sheets.splice(i, 1);
      sheets.splice(to, 0, m);
      return { ...d, sheets };
    });
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

  const runAction = (act: string) => {
    switch (act) {
      case "relation":
        return startRelation();
      case "boundary":
        return toggleBoundary();
      case "marker":
        return openInsert("marker");
      case "link":
        return openInsert("link");
      case "note":
        return openInsert("note");
      case "label":
        return openInsert("label");
      case "task":
        return openInsert("task");
      case "image":
        return sel ? imgInput.current?.click() : say("Pilih topik dulu");
      case "summary":
        return makeSummary();
      case "zoomIn":
        return canvas.current?.zoomBy(1.2);
      case "zoomOut":
        return canvas.current?.zoomBy(1 / 1.2);
      case "actual":
        return canvas.current?.actual();
      case "fit":
        return canvas.current?.fit();
      case "central":
        setSelectedId(sheet.rootId);
        setMulti([]);
        return canvas.current?.focusNode(sheet.rootId);
      case "zen":
        return setZen((z) => !z);
    }
  };
  const runRef = useRef(runAction);
  runRef.current = runAction;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showPitch || showMapPres || editingId || attachFor || insertKind || showSc) return;
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key;
      if (mod && !e.altKey && k.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if (mod && k.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (mod || (e.altKey && /^F\d+$/.test(k)) || /^F\d+$/.test(k)) {
        const act = findAction(scMap, comboOf(e));
        if (act) {
          e.preventDefault();
          runRef.current(act);
          return;
        }
      }
      if (mod) return;
      if (k === "?" || (k === "/" && e.shiftKey)) {
        e.preventDefault();
        setShowFormat(true);
        setPanelTab("keys");
        return;
      }
      if (selFloat && (k === "Delete" || k === "Backspace")) {
        e.preventDefault();
        applySheet((s) => ({ ...s, floats: s.floats.filter((f) => f.id !== selFloat) }));
        setSelFloat(null);
        return;
      }
      if (selRel && (k === "Delete" || k === "Backspace")) {
        e.preventDefault();
        applySheet((sh) => ({ ...sh, relations: (sh.relations ?? []).filter((r) => r.id !== selRel) }));
        setSelRel(null);
        return;
      }
      if (k === "Escape") {
        if (zen) setZen(false);
        if (relFrom) setRelFrom(null);
        setSelRel(null);
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
  }, [showPitch, editingId, attachFor, insertKind, showSc, scMap, selRel, relFrom, zen, sel, selectedId, selFloat, multi, makeSummary, applySheet, setNodes, undo, redo, addChildOf, addSiblingOf, deleteNode, toggleCollapse, navigate]);

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
  const isMap = !sheet.table && !sheet.venn;

  return (
    <div className={"editor" + (zen ? " zen" : "")}>
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
        {isMap && (
          <button className={"btn" + (showOutline ? " active" : "")} onClick={() => setShowOutline((v) => !v)}>
            ☰ <span className="hide-sm">Kerangka</span>
          </button>
        )}
        {sheet.venn ? null : sheet.table ? (
          <button className={"btn" + (tblTools ? " active" : "")} onClick={() => setTblTools((v) => !v)}>
            🎨 <span className="hide-sm">Format</span>
          </button>
        ) : (
          <button className={"btn" + (showFormat && panelTab !== "keys" && panelTab !== "help" ? " active" : "")} onClick={() => (showFormat && panelTab !== "keys" && panelTab !== "help" ? setShowFormat(false) : (setShowFormat(true), setPanelTab(sel ? "topic" : "map")))}>
            🎨 <span className="hide-sm">Format</span>
          </button>
        )}
        <button className={"btn icon" + (showFormat && (panelTab === "keys" || panelTab === "help") ? " active" : "")} title="Pintasan keyboard &amp; panduan (?)" aria-label="Pintasan" onClick={() => (showFormat && (panelTab === "keys" || panelTab === "help") ? setShowFormat(false) : (setShowFormat(true), setPanelTab("keys")))}>
          ?
        </button>
        <button className="btn" onClick={() => setShowExport(true)}>
          ⬇ <span className="hide-sm">Ekspor</span>
        </button>
        {isMap && (
          <button className="btn" onClick={() => setShowMapPres(true)} title="Presentasi Peta: peta terbuka bertahap, kamera mengikuti topik">
            🧭 <span className="hide-sm">Presentasi Peta</span>
          </button>
        )}
        <button className="btn primary" onClick={() => setShowPitch(true)}>
          {sheet.table || sheet.venn ? "▶ Presentasi" : "🎬 Presentasi"}
        </button>
      </header>

      {isMap && (
        <div className="ribbon" role="toolbar" aria-label="Alat topik">
          <button className="rb" disabled={!sel || !!sel.summary} onClick={() => sel && addChildOf(sel.id)} title="Subtopik (Tab)">
            <span className="ic">⊢</span>Subtopik
          </button>
          <button className={"rb" + (relFrom ? " on" : "")} onClick={() => (relFrom ? setRelFrom(null) : startRelation())} title={`Hubungan (${scMap.relation})`}>
            <span className="ic">↷</span>Hubungan
          </button>
          <button className="rb" disabled={!sel || !sel.parentId} onClick={makeSummary} title={`Ringkasan (${scMap.summary})`}>
            <span className="ic">⎬</span>Ringkasan
          </button>
          <button className={"rb" + (sel?.boundary ? " on" : "")} disabled={!sel} onClick={toggleBoundary} title={`Batas (${scMap.boundary})`}>
            <span className="ic">▢</span>Batas
          </button>
          <button className="rb" disabled={!sel} onClick={() => openInsert("marker")} title={`Penanda (${scMap.marker})`}>
            <span className="ic">☆</span>Penanda
          </button>
          <button
            className={"rb" + (menu ? " on" : "")}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setMenu(menu ? null : { kind: "ins", x: r.left, y: r.bottom + 4 });
            }}
          >
            <span className="ic">＋ ▾</span>Sisipkan
          </button>
          <div className="rb-sep" />
          <button className="rb" onClick={() => setZen(true)} title={`Mode ZEN (${scMap.zen})`}>
            <span className="ic">⛶</span>ZEN
          </button>
          <button className="rb" onClick={() => canvas.current?.focusNode(sheet.rootId)} title={`Buka Topik Sentral (${scMap.central})`}>
            <span className="ic">◎</span>Pusat
          </button>
        </div>
      )}

      <div className="workspace">
        {showOutline && isMap && (
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
          {sheet.venn ? (
            <div className="canvas-area">
              <VennEditor sheet={sheet} onChange={(fn) => applySheet((sh) => ({ ...sh, venn: fn(sh.venn!) }))} onPresent={() => setShowPitch(true)} />
              {toast && <div className="toast">{toast}</div>}
            </div>
          ) : sheet.table ? (
            <div className="canvas-area">
              <TableEditor sheet={sheet} onChange={(fn) => applySheet((sh) => ({ ...sh, table: fn(sh.table!) }))} onPresent={() => setShowPitch(true)} onFocusMode={() => setZen(true)} tools={tblTools} onTools={setTblTools} onAttach={(r, c) => setAttachCell(`${r},${c}`)} />
              {toast && <div className="toast">{toast}</div>}
            </div>
          ) : (
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
              selRel={selRel}
              onSelectRel={(id) => {
                setSelRel(id);
                setSelectedId(null);
                setMulti([]);
              }}
              onDeco={onDeco}
              onTapNode={(id) => tapAttach && !relFrom && sheet.nodes[id]?.attachments?.length && setAttachFor(id)}
              pickMode={!!relFrom}
            />
            {relFrom && (
              <div className="pick-banner">
                Ketuk topik tujuan hubungan
                <button onClick={() => setRelFrom(null)}>Batal</button>
              </div>
            )}
            {selRel && (
              <div className="pick-banner">
                Hubungan
                <button onClick={() => setRelEdit(true)}>Teks</button>
                <button onClick={() => (applySheet((sh) => ({ ...sh, relations: (sh.relations ?? []).filter((r) => r.id !== selRel) })), setSelRel(null))}>Hapus</button>
              </div>
            )}

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
              <button className="btn" disabled={!sel || !!sel.summary} onClick={() => sel && addChildOf(sel.id)}>
                ＋ Anak
              </button>
              <button className="btn" disabled={!sel || !sel.parentId || !!sel.summary} onClick={() => sel && addSiblingOf(sel.id)}>
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
              <button className="btn" disabled={!sel || !sel.parentId} onClick={makeSummary} title="Ringkasan: kurung yang merangkum topik terpilih (pilih beberapa saudara dengan ☑)">
                ⎬ Ringkasan
              </button>
              <button className="btn" disabled={!sel || !sel.parentId} onClick={selectSiblings} title="Pilih semua saudara">
                ⫴ Saudara
              </button>
              <button className="btn danger" disabled={!sel || (!sel.parentId && !sel.summary)} onClick={() => (multi.length > 1 ? deleteMany(multi) : sel && deleteNode(sel.id))}>
                🗑
              </button>
            </div>
            {toast && <div className="toast">{toast}</div>}
          </div>
          )}
          <SheetBar
            sheets={doc.sheets}
            activeId={doc.activeId}
            topicCount={sheet.venn ? sheet.venn.diagrams.length : sheet.table ? sheet.table.rows * sheet.table.cols : topicCount === totalTopics ? totalTopics : topicCount}
            unit={sheet.venn ? "diagram" : sheet.table ? "sel" : "topik"}
            onSelect={selectSheet}
            onAdd={addSheet}
            onRename={renameSheet}
            onDuplicate={duplicateSheet}
            onDelete={deleteSheet}
            onMove={moveSheet}
            onReorder={reorderSheet}
          />
        </div>

        {showFormat && (isMap || panelTab === "keys" || panelTab === "help") && (
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
            onToTable={mapToTableSheet}
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
            shortcuts={scMap}
            tapAttach={tapAttach}
            onTapAttach={changeTapAttach}
            onCustomize={() => setShowSc(true)}
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

      {menu && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 69 }} onPointerDown={() => setMenu(null)} />
          <div className="menu-pop" style={{ left: Math.min(menu.x, window.innerWidth - 230), top: menu.y }}>
            {menu.kind === "ins" && (
              <>
                <button onClick={() => openInsert("note")}><span className="ic">📝</span>Catatan<span className="kb">{scMap.note}</span></button>
                <button onClick={() => openInsert("label")}><span className="ic">🏷</span>Label<span className="kb">{scMap.label}</span></button>
                <button onClick={() => openInsert("task")}><span className="ic">☑</span>Tugas<span className="kb">{scMap.task}</span></button>
                <button onClick={() => openInsert("link")}><span className="ic">🔗</span>Tautan<span className="kb">{scMap.link}</span></button>
                <hr />
                <button onClick={() => (setMenu(null), sel ? setAttachFor(sel.id) : say("Pilih topik dulu"))}><span className="ic">📎</span>Lampiran</button>
                <button onClick={() => openInsert("audio")}><span className="ic">🎙</span>Catatan Audio</button>
                <hr />
                <button onClick={() => openInsert("sticker")}><span className="ic">😀</span>Stiker</button>
                <button onClick={() => openInsert("illus")}><span className="ic">🖼</span>Ilustrasi</button>
                <button onClick={() => (setMenu(null), sel ? imgInput.current?.click() : say("Pilih topik dulu"))}><span className="ic">🏞</span>Gambar Lokal<span className="kb">{scMap.image}</span></button>
                <button onClick={() => openInsert("eq")}><span className="ic">∑</span>Persamaan</button>
              </>
            )}
          </div>
        </>
      )}
      {insertKind && (
        <InsertDialog
          kind={insertKind}
          node={sel}
          sheet={sheet}
          doc={doc}
          docId={doc.id}
          onPatch={patchSel}
          onClose={() => setInsertKind(null)}
        />
      )}
      {relEdit && selRel && (
        <InsertDialog
          kind="relLabel"
          node={null}
          sheet={sheet}
          doc={doc}
          docId={doc.id}
          relLabel={(sheet.relations ?? []).find((r) => r.id === selRel)?.label}
          onPatch={() => {}}
          onRelLabel={(t) => applySheet((sh) => ({ ...sh, relations: (sh.relations ?? []).map((r) => (r.id === selRel ? { ...r, label: t || undefined } : r)) }))}
          onClose={() => setRelEdit(false)}
        />
      )}
      {showSc && <ShortcutsDialog map={scMap} onChange={(m) => (setScMap(m), saveShortcuts(m))} onClose={() => setShowSc(false)} />}
      {zen && (
        <button className="btn zen-exit" onClick={() => setZen(false)}>
          ✕ Keluar ZEN
        </button>
      )}
      {attachCell && sheet.table && (
        <AttachmentViewer
          title={(sheet.table.cells[+attachCell.split(",")[0]]?.[+attachCell.split(",")[1]] ?? "").split("\n")[0].slice(0, 40) || `sel ${+attachCell.split(",")[0] + 1}:${+attachCell.split(",")[1] + 1}`}
          items={sheet.table.style[attachCell]?.att ?? []}
          onAdd={(fs) => addCellAttachments(attachCell, fs)}
          onRemove={(id) => setCellAtt(attachCell, (l) => l.filter((a) => a.id !== id))}
          onClose={() => setAttachCell(null)}
        />
      )}
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
      {showNew && (
        <div className="modal-back" onClick={() => setShowNew(false)}>
          <div className="modal" style={{ width: "min(520px,100%)" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><b>Lembar baru</b><div className="spacer" /><button className="btn icon small" onClick={() => setShowNew(false)}>✕</button></div>
            <div className="newsheet-list">
              <button className="newsheet-item" onClick={addMapSheet}><b>🧠 Peta pikiran</b><span className="small muted">Topik bercabang seperti biasa</span></button>
              <label className="newsheet-item" style={{ cursor: "pointer" }}>
                <b>📥 Impor berkas…</b>
                <span className="small muted">.mapit, peta lintas aplikasi (.xmind), .json, Markdown/teks, .csv/.tsv (jadi tabel)</span>
                <input
                  type="file"
                  hidden
                  accept=".mapit,.mindpitch,.xmind,.zip,.json,.md,.markdown,.txt,.csv,.tsv"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) importSheets(f);
                  }}
                />
              </label>
              {TABLE_TEMPLATES.map((x) => (
                <button key={x.id} className="newsheet-item" onClick={() => addTableSheet(x.id)}><b>▦ {x.title}</b><span className="small muted">{x.sub}</span></button>
              ))}
              <button className="newsheet-item" onClick={addVennSheet}><b>◯ Diagram Venn</b><span className="small muted">2–3 lingkaran, irisan, nisbah (sama, terpisah, di dalam, beririsan)</span></button>
            </div>
          </div>
        </div>
      )}
      {showPitch && sheet.table && <TablePresenter sheet={sheet} onClose={() => setShowPitch(false)} onAttach={(r, c) => setAttachCell(`${r},${c}`)} />}
      {showPitch && sheet.venn && <VennPresenter sheet={sheet} onClose={() => setShowPitch(false)} />}
      {showMapPres && isMap && <MapPresenter sheet={sheet} onClose={() => setShowMapPres(false)} onAttach={setAttachFor} />}
      {showPitch && isMap && <PitchPanel wb={doc} sheet={sheet} startId={selectedId} applySheet={applySheet} onClose={() => setShowPitch(false)} />}
    </div>
  );
}
