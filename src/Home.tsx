import { useEffect, useRef, useState } from "react";
import { fromJSON, fromMarkdown, toSvg } from "./exporters";
import { newDoc, sampleDoc } from "./model";
import { deleteDoc, listDocs, saveDoc } from "./storage";
import { MapDoc } from "./types";

interface Props {
  onOpen: (d: MapDoc) => void;
}

export default function Home({ onOpen }: Props) {
  const [docs, setDocs] = useState<MapDoc[] | null>(null);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => listDocs().then(setDocs).catch(() => setDocs([]));
  useEffect(() => {
    refresh();
  }, []);

  const create = async (sample = false) => {
    const d = sample ? sampleDoc() : newDoc();
    await saveDoc(d);
    onOpen(d);
  };

  const remove = async (id: string) => {
    if (!confirm("Hapus peta ini?")) return;
    await deleteDoc(id);
    refresh();
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const text = await f.text();
      let d: MapDoc;
      if (f.name.endsWith(".md") || f.name.endsWith(".markdown")) {
        d = fromMarkdown(text, f.name.replace(/\.md$|\.markdown$/, ""));
      } else {
        d = fromJSON(text);
      }
      await saveDoc(d);
      onOpen(d);
    } catch (ex) {
      setErr(String(ex));
    }
  };

  return (
    <div className="home">
      <header className="home-header">
        <div className="brand">
          <span className="logo">◇</span>
          <div>
            <h1>MindPitch</h1>
            <p>Peta pikiran yang bisa dipresentasikan</p>
          </div>
        </div>
        <div className="home-actions">
          <button className="primary" onClick={() => create(false)}>
            + Peta baru
          </button>
          <button onClick={() => create(true)}>Contoh</button>
          <button onClick={() => fileRef.current?.click()}>Impor</button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,.md,.markdown"
            hidden
            onChange={onFile}
          />
        </div>
      </header>

      {err && (
        <div className="banner error" onClick={() => setErr("")}>
          {err}
        </div>
      )}

      <section className="doc-list">
        {docs === null ? (
          <p className="muted">Memuat…</p>
        ) : docs.length === 0 ? (
          <div className="empty">
            <p>Belum ada peta.</p>
            <button className="primary" onClick={() => create(false)}>
              Buat yang pertama
            </button>
          </div>
        ) : (
          <ul>
            {docs.map((d) => (
              <li key={d.id}>
                <button className="doc-card" onClick={() => onOpen(d)}>
                  <strong>{d.title || "Tanpa judul"}</strong>
                  <span className="muted">
                    {new Date(d.updatedAt).toLocaleString("id-ID")}
                  </span>
                </button>
                <button className="icon danger" title="Hapus" onClick={() => remove(d.id)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="home-foot">
        <p>
          Data tersimpan di perangkat ini (IndexedDB). Bisa diekspor ke JSON / Markdown / PNG / SVG /
          video.
        </p>
      </footer>
    </div>
  );
}
