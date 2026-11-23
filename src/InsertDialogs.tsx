import { useEffect, useRef, useState } from "react";
import { getFile, putFile } from "./files";
import { ILLUSTRATION_ITEMS, MARKER_GROUPS, STICKER_ITEMS, eqToText } from "./deco";
import { MNode, Sheet, Workbook } from "./types";

export type InsertKind = "note" | "label" | "task" | "link" | "sticker" | "illus" | "marker" | "eq" | "audio" | "relLabel" | "shortcuts";

interface Props {
  kind: InsertKind;
  node: MNode | null;
  sheet: Sheet;
  doc: Workbook;
  docId: string;
  relLabel?: string;
  onPatch(p: Partial<MNode>): void;
  onRelLabel?(t: string): void;
  onClose(): void;
}

const TITLES: Record<InsertKind, string> = {
  note: "Catatan",
  label: "Label",
  task: "Tugas",
  link: "Tautan",
  sticker: "Stiker",
  illus: "Ilustrasi",
  marker: "Penanda",
  eq: "Persamaan",
  audio: "Catatan Audio",
  relLabel: "Teks Hubungan",
  shortcuts: "",
};

export default function InsertDialog(p: Props) {
  const { kind, node } = p;
  const [text, setText] = useState(kind === "note" ? node?.note ?? "" : kind === "eq" ? node?.eq ?? "" : kind === "label" ? (node?.labels ?? []).join(", ") : kind === "relLabel" ? p.relLabel ?? "" : "");
  const [pct, setPct] = useState(node?.task ?? 0);
  const [lk, setLk] = useState<"web" | "node" | "sheet">(node?.link?.kind ?? "web");
  const [target, setTarget] = useState(node?.link?.target ?? "");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && p.onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p]);

  const done = (patch: Partial<MNode>) => {
    p.onPatch(patch);
    p.onClose();
  };

  let body: JSX.Element | null = null;
  if (kind === "note")
    body = (
      <>
        <textarea autoFocus className="note-input big" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Tulis catatan untuk topik ini…" />
        <Foot onClose={p.onClose} onOk={() => done({ note: text.trim() || undefined })} extra={node?.note ? <button className="btn danger" onClick={() => done({ note: undefined })}>Hapus</button> : null} />
      </>
    );
  else if (kind === "relLabel")
    body = (
      <>
        <input autoFocus className="txt" value={text} onChange={(e) => setText(e.target.value)} placeholder="Teks pada garis hubungan" onKeyDown={(e) => e.key === "Enter" && (p.onRelLabel?.(text.trim()), p.onClose())} />
        <Foot onClose={p.onClose} onOk={() => (p.onRelLabel?.(text.trim()), p.onClose())} />
      </>
    );
  else if (kind === "label")
    body = (
      <>
        <input autoFocus className="txt" value={text} onChange={(e) => setText(e.target.value)} placeholder="Pisahkan dengan koma: fi'il, madhi, penting" onKeyDown={(e) => e.key === "Enter" && done({ labels: text.split(/[,،]/).map((s) => s.trim()).filter(Boolean) })} />
        <p className="small muted">Label tampil sebagai kapsul kecil di bawah topik.</p>
        <Foot onClose={p.onClose} onOk={() => done({ labels: text.split(/[,،]/).map((s) => s.trim()).filter(Boolean) })} extra={node?.labels?.length ? <button className="btn danger" onClick={() => done({ labels: undefined })}>Hapus</button> : null} />
      </>
    );
  else if (kind === "eq")
    body = (
      <>
        <input autoFocus className="txt" value={text} onChange={(e) => setText(e.target.value)} placeholder="mis. x^2 + y^2 = r^2 atau \frac{a}{b}" />
        <div className="eq-preview">{eqToText(text) || "Pratinjau"}</div>
        <p className="small muted">Mendukung ^ (pangkat), _ (indeks), \frac{"{a}{b}"}, \sqrt{"{x}"}, \pi, \alpha, \times, \leq, dst.</p>
        <Foot onClose={p.onClose} onOk={() => done({ eq: text.trim() || undefined })} extra={node?.eq ? <button className="btn danger" onClick={() => done({ eq: undefined })}>Hapus</button> : null} />
      </>
    );
  else if (kind === "task")
    body = (
      <>
        <div className="task-opts">
          {[0, 25, 50, 75, 100].map((v) => (
            <button key={v} className={"btn" + (pct === v ? " primary" : "")} onClick={() => setPct(v)}>
              {v === 0 ? "☐ Belum" : v === 100 ? "✅ Selesai" : v + "%"}
            </button>
          ))}
        </div>
        <input type="range" min={0} max={100} step={5} value={pct} onChange={(e) => setPct(+e.target.value)} style={{ width: "100%" }} />
        <Foot onClose={p.onClose} onOk={() => done({ task: pct })} extra={node?.task !== undefined ? <button className="btn danger" onClick={() => done({ task: undefined })}>Hapus</button> : null} />
      </>
    );
  else if (kind === "link") {
    const topics = Object.values(p.sheet.nodes).filter((n) => !n.summary);
    const ok = () => {
      const t = target.trim();
      if (!t) return done({ link: undefined });
      done({ link: { kind: lk, target: lk === "web" && !/^[a-z]+:\/\//i.test(t) ? "https://" + t : t } });
    };
    body = (
      <>
        <div className="seg">
          {([["web", "Halaman web"], ["node", "Topik"], ["sheet", "Lembar"]] as const).map(([k, l]) => (
            <button key={k} className={lk === k ? "on" : ""} onClick={() => (setLk(k), setTarget(""))}>
              {l}
            </button>
          ))}
        </div>
        {lk === "web" && <input autoFocus className="txt" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="https://…" onKeyDown={(e) => e.key === "Enter" && ok()} />}
        {lk === "node" && (
          <select className="txt" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">— pilih topik —</option>
            {topics.map((n) => (
              <option key={n.id} value={n.id}>
                {n.text.split("\n")[0].slice(0, 50)}
              </option>
            ))}
          </select>
        )}
        {lk === "sheet" && (
          <select className="txt" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">— pilih lembar —</option>
            {p.doc.sheets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        )}
        <p className="small muted">Ketuk ikon 🔗 pada topik untuk membuka tautan.</p>
        <Foot onClose={p.onClose} onOk={ok} extra={node?.link ? <button className="btn danger" onClick={() => done({ link: undefined })}>Hapus</button> : null} />
      </>
    );
  } else if (kind === "marker")
    body = (
      <div className="pick-grid">
        {MARKER_GROUPS.map((g) => (
          <div key={g.title}>
            <h5>{g.title}</h5>
            <div className="emojis">
              {g.items.map((m) => {
                const on = node?.markers?.includes(m);
                return (
                  <button key={m} className={"emo" + (on ? " on" : "")} onClick={() => p.onPatch({ markers: on ? (node?.markers ?? []).filter((x) => x !== m) : [...(node?.markers ?? []), m] })}>
                    {m}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <Foot onClose={p.onClose} okLabel="Selesai" onOk={p.onClose} extra={node?.markers?.length ? <button className="btn danger" onClick={() => p.onPatch({ markers: undefined })}>Hapus semua</button> : null} />
      </div>
    );
  else if (kind === "sticker" || kind === "illus") {
    const items = kind === "sticker" ? STICKER_ITEMS : ILLUSTRATION_ITEMS;
    body = (
      <div className="pick-grid">
        <div className="emojis">
          {items.map((m) => {
            const on = node?.stickers?.includes(m);
            return (
              <button key={m} className={"emo big" + (on ? " on" : "")} onClick={() => p.onPatch({ stickers: on ? (node?.stickers ?? []).filter((x) => x !== m) : [...(node?.stickers ?? []), m] })}>
                {m}
              </button>
            );
          })}
        </div>
        <Foot onClose={p.onClose} okLabel="Selesai" onOk={p.onClose} extra={node?.stickers?.length ? <button className="btn danger" onClick={() => p.onPatch({ stickers: undefined })}>Hapus semua</button> : null} />
      </div>
    );
  } else if (kind === "audio") body = <AudioBody {...p} />;

  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <div className="modal small-modal" onPointerDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <b>{TITLES[kind]}</b>
          <div className="spacer" />
          <button className="btn icon small" onClick={p.onClose}>
            ✕
          </button>
        </div>
        <div className="small-body">{body}</div>
      </div>
    </div>
  );
}

function Foot({ onClose, onOk, okLabel = "Simpan", extra }: { onClose(): void; onOk(): void; okLabel?: string; extra?: JSX.Element | null }) {
  return (
    <div className="dlg-foot">
      {extra}
      <div className="spacer" />
      <button className="btn" onClick={onClose}>
        Batal
      </button>
      <button className="btn primary" onClick={onOk}>
        {okLabel}
      </button>
    </div>
  );
}

function AudioBody(p: Props) {
  const [rec, setRec] = useState(false);
  const [err, setErr] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [secs, setSecs] = useState(0);
  const mr = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef(0);

  useEffect(() => {
    let u: string | null = null;
    if (p.node?.audio) getFile(p.node.audio.id).then((f) => f && (setUrl((u = URL.createObjectURL(f.blob)))));
    return () => {
      if (u) URL.revokeObjectURL(u);
      window.clearInterval(timer.current);
      mr.current?.state === "recording" && mr.current.stop();
    };
  }, [p.node?.audio?.id]);

  const start = async () => {
    setErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      mr.current = rec;
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
        const id = await putFile(p.docId, blob, "Catatan audio." + ext, blob.type);
        p.onPatch({ audio: { id, name: "Catatan audio." + ext, mime: blob.type, size: blob.size } });
      };
      rec.start();
      setRec(true);
      setSecs(0);
      timer.current = window.setInterval(() => setSecs((s) => s + 1), 1000);
    } catch {
      setErr("Mikrofon tidak dapat diakses. Izinkan akses mikrofon pada peramban.");
    }
  };
  const stop = () => {
    window.clearInterval(timer.current);
    mr.current?.stop();
    setRec(false);
  };
  return (
    <>
      {p.node?.audio && url && !rec && <audio controls src={url} style={{ width: "100%" }} />}
      <div className="task-opts">
        {!rec ? (
          <button className="btn primary" onClick={start}>
            ● {p.node?.audio ? "Rekam ulang" : "Mulai merekam"}
          </button>
        ) : (
          <button className="btn danger" onClick={stop}>
            ■ Berhenti ({secs} dtk)
          </button>
        )}
        {p.node?.audio && !rec && (
          <button className="btn danger" onClick={() => (p.onPatch({ audio: undefined }), setUrl(null))}>
            Hapus
          </button>
        )}
      </div>
      {err && <p className="small" style={{ color: "var(--danger)" }}>{err}</p>}
      <div className="dlg-foot">
        <div className="spacer" />
        <button className="btn primary" onClick={p.onClose}>
          Selesai
        </button>
      </div>
    </>
  );
}
