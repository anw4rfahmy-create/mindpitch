import { useEffect, useState } from "react";
import Editor from "./Editor";
import Home from "./Home";
import { readShareHash } from "./shareLink";
import { saveDoc } from "./storage";
import { Workbook } from "./types";

export default function App() {
  const [doc, setDoc] = useState<Workbook | null>(null);
  useEffect(() => {
    const run = () => {
      if (!location.hash.startsWith("#import=")) return;
      const hash = location.hash;
      history.replaceState(null, "", location.pathname + location.search);
      const wb = readShareHash(hash);
      if (!wb) return void alert("Tautan impor tidak valid atau rusak.");
      if (!window.confirm(`Buka "${wb.title}" (${wb.sheets.length} lembar) dari tautan ini? Berkas akan disimpan di perangkat Anda.`)) return;
      saveDoc(wb).then(() => setDoc(wb));
    };
    run();
    window.addEventListener("hashchange", run);
    return () => window.removeEventListener("hashchange", run);
  }, []);
  return doc ? (
    <Editor key={doc.id} initial={doc} onBack={() => setDoc(null)} />
  ) : (
    <Home onOpen={setDoc} />
  );
}
