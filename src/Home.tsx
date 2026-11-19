import { useEffect, useRef, useState } from "react";
import { importFile as importAny, sheetToPngBlob } from "./exporters";
import { ensureFonts } from "./fonts";
import { activeSheet, newWorkbook, sampleWorkbook } from "./model";
import { deleteDoc, duplicateDoc, listDocs, saveDoc } from "./storage";
import { Workbook } from "./types";

interface Props {
  onOpen(doc: Workbook): void;
}

interface InstallEvent extends Event {
  prompt(): Promise<void>;
}

function Preview({ doc }: { doc: Workbook }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let url = "";
    let dead = false;
    const sh = activeSheet(doc);
    ensureFonts([sh.font])
      .then(() => sheetToPngBlob(sh, 0.6))
      .then((b) => {
        if (dead) return;
        url = URL.createObjectURL(b);
        setSrc(url);
      })
      .catch(() => {});
    return () => {
      dead = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [doc]);
  return src ? <img className="doc-preview" src={src} alt="" /> : <div className="doc-preview" />;
}

export default function Home({ onOpen }: Props) {
  const [docs, setDocs] = useState<Workbook[] | null>(null);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = async () => setDocs(await listDocs());

  useEffect(() => {
    (async () => {
      let all = await listDocs();
      if (!all.length && !localStorage.getItem("mindpitch.seeded")) {
        await saveDoc(sampleWorkbook());
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
    const d = newWorkbook("Peta baru");
    await saveDoc(d);
    onOpen(d);
  };

  const duplicate = async (d: Workbook) => {
    await duplicateDoc(d);
    reload();
  };

  const remove = async (d: Workbook) => {
    if (!window.confirm(`Hapus "${d.title}"? Tindakan ini tidak bisa dibatalkan.`)) return;
    await deleteDoc(d.id);
    reload();
  };

  const importFile = async (f: File) => {
    const d = await importAny(f);
    if (!d) return alert("Berkas tidak dikenali. Gunakan berkas .mindpitch, JSON hasil ekspor, atau Markdown/teks berindentasi.");
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
          accept=".mindpitch,.zip,.json,.md,.markdown,.txt"
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
                    {d.sheets.length} lembar · {d.sheets.reduce((a, x) => a + Object.keys(x.nodes).length, 0)} topik · {new Date(d.updatedAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
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
