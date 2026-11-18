import { useEffect, useRef, useState } from "react";
import { fromJSON, fromMarkdown, toSvg } from "./exporters";
import { newDoc, sampleDoc } from "./model";
import { deleteDoc, listDocs, saveDoc } from "./storage";
import { MapDoc } from "./types";

interface Props {
  onOpen(doc: MapDoc): void;
}

interface InstallEvent extends Event {
  prompt(): Promise<void>;
}

function Preview({ doc }: { doc: MapDoc }) {
  let src = "";
  try {
    const { svg } = toSvg(doc);
    src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  } catch {
    /* abaikan */
  }
  return src ? <img className="doc-preview" src={src} alt="" /> : <div className="doc-preview" />;
}

export default function Home({ onOpen }: Props) {
  const [docs, setDocs] = useState<MapDoc[] | null>(null);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = async () => setDocs(await listDocs());

  useEffect(() => {
    (async () => {
      let all = await listDocs();
      if (!all.length && !localStorage.getItem("mindpitch.seeded")) {
        await saveDoc(sampleDoc());
        localStorage.setItem("mindpitch.seeded", "1");
        all = await listDocs();
      }
      setDocs(all);
    })().catch(() => setDocs([]));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const create = async () => {
    const d = newDoc("Peta baru");
    await saveDoc(d);
    onOpen(d);
  };

  const duplicate = async (d: MapDoc) => {
    const copy: MapDoc = { ...d, id: Math.random().toString(36).slice(2), title: d.title + " (salinan)", createdAt: Date.now(), updatedAt: Date.now() };
    await saveDoc(copy);
    reload();
  };

  const remove = async (d: MapDoc) => {
    if (!window.confirm(`Hapus "${d.title}"? Tindakan ini tidak bisa dibatalkan.`)) return;
    await deleteDoc(d.id);
    reload();
  };

  const importFile = async (f: File) => {
    const text = await f.text();
    const isJson = f.name.toLowerCase().endsWith(".json") || text.trim().startsWith("{");
    const d = isJson ? fromJSON(text) : fromMarkdown(text, f.name.replace(/\.[^.]+$/, ""));
    if (!d) return alert("Berkas tidak dikenali. Gunakan JSON hasil ekspor atau Markdown/teks berindentasi.");
    await saveDoc(d);
    onOpen(d);
  };

  return (
    <div className="home">
      <header className="home-head">
        <div>
          <h1>MindPitch</h1>
          <p className="muted">Peta pikiran yang bisa langsung jadi presentasi dan video.</p>
        </div>
        <div className="spacer" />
        {install && (
          <button
            className="btn"
            onClick={async () => {
              await install.prompt();
              setInstall(null);
            }}
          >
            ⬇ Pasang aplikasi
          </button>
        )}
        <button className="btn" onClick={() => fileRef.current?.click()}>
          Impor
        </button>
        <button className="btn primary" onClick={create}>
          ＋ Peta baru
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.md,.markdown,.txt,application/json,text/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) importFile(f);
          }}
        />
      </header>

      {docs === null ? (
        <p className="muted pad">Memuat…</p>
      ) : !docs.length ? (
        <div className="empty">
          <p>Belum ada peta. Mulai dengan membuat peta baru.</p>
          <button className="btn primary" onClick={create}>
            ＋ Peta baru
          </button>
        </div>
      ) : (
        <div className="doc-grid">
          {docs.map((d) => (
            <div key={d.id} className="doc-card">
              <button className="doc-open" onClick={() => onOpen(d)}>
                <Preview doc={d} />
                <div className="doc-info">
                  <b>{d.title}</b>
                  <span className="muted small">
                    {Object.keys(d.nodes).length} topik · {new Date(d.updatedAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </div>
              </button>
              <div className="doc-actions">
                <button className="btn small" onClick={() => duplicate(d)}>
                  Duplikat
                </button>
                <button className="btn small danger" onClick={() => remove(d)}>
                  Hapus
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
