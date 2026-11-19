import { useCallback, useEffect, useRef, useState } from "react";
import { Sheet, Workbook } from "./types";
import { replaceSheet } from "./model";
import { saveDoc } from "./storage";

interface Snap {
  sheets: Workbook["sheets"];
  activeId: string;
  title: string;
}
const snap = (d: Workbook): Snap => ({ sheets: d.sheets, activeId: d.activeId, title: d.title });

export function useDoc(initial: Workbook) {
  const [doc, setDoc] = useState<Workbook>(initial);
  const docRef = useRef(initial);
  const past = useRef<Snap[]>([]);
  const future = useRef<Snap[]>([]);
  const [, bump] = useState(0);
  const [saved, setSaved] = useState(true);

  /** Terapkan perubahan. history=false untuk perubahan yang tidak perlu undo (mis. pengaturan Pitch). */
  const apply = useCallback((fn: (d: Workbook) => Workbook, history = true) => {
    const cur = docRef.current;
    const res = fn(cur);
    if (res === cur) return;
    if (history) {
      past.current.push(snap(cur));
      if (past.current.length > 150) past.current.shift();
      future.current = [];
    }
    const next = { ...res, updatedAt: Date.now() };
    docRef.current = next;
    setDoc(next);
    setSaved(false);
    bump((n) => n + 1);
  }, []);

  const undo = useCallback(() => {
    const s = past.current.pop();
    if (!s) return;
    future.current.push(snap(docRef.current));
    const next = { ...docRef.current, ...s, updatedAt: Date.now() };
    docRef.current = next;
    setDoc(next);
    setSaved(false);
    bump((n) => n + 1);
  }, []);

  const redo = useCallback(() => {
    const s = future.current.pop();
    if (!s) return;
    past.current.push(snap(docRef.current));
    const next = { ...docRef.current, ...s, updatedAt: Date.now() };
    docRef.current = next;
    setDoc(next);
    setSaved(false);
    bump((n) => n + 1);
  }, []);

  // simpan otomatis (debounce)
  useEffect(() => {
    if (saved) return;
    const t = setTimeout(() => {
      saveDoc(docRef.current)
        .then(() => setSaved(true))
        .catch(() => {});
    }, 450);
    return () => clearTimeout(t);
  }, [doc, saved]);

  // simpan saat tab ditutup / disembunyikan, dan saat editor ditutup
  const dirty = useRef(false);
  useEffect(() => {
    dirty.current = !saved;
  }, [saved]);
  useEffect(() => {
    const flush = () => {
      saveDoc(docRef.current).catch(() => {});
    };
    const vis = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", vis);
      if (dirty.current) flush();
    };
  }, []);

  /** Ubah lembar aktif saja. */
  const applySheet = useCallback(
    (fn: (s: Sheet) => Sheet, history = true) => apply((d) => replaceSheet(d, d.activeId, fn), history),
    [apply]
  );

  return {
    doc,
    apply,
    applySheet,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    saved,
  };
}
