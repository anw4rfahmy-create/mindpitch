import { useState } from "react";
import { FONTS } from "./fonts";
import { NODE_COLORS } from "./nodeStyle";
import { MAP_PALETTES } from "./themes";
import { reorder, outdent, indent, foldToLevel, maxDepth } from "./model";
import { ImgSize, LineStyle, MNode, NodeShape, Sheet, StructureId, TopicStyle } from "./types";

export const STRUCTURES: { id: StructureId; label: string; icon: string }[] = [
  { id: "mind-both", label: "Peta pikiran", icon: "◐" },
  { id: "mind-right", label: "Peta ke kanan", icon: "◑" },
  { id: "mind-left", label: "Peta ke kiri", icon: "◐" },
  { id: "logic-right", label: "Bagan logika →", icon: "⊢" },
  { id: "logic-left", label: "Bagan logika ←", icon: "⊣" },
  { id: "logic-both", label: "Logika dua sisi", icon: "⊥" },
  { id: "brace-right", label: "Kurung kurawal →", icon: "}" },
  { id: "brace-left", label: "Kurung kurawal ←", icon: "{" },
  { id: "org-down", label: "Organisasi ↓", icon: "⊤" },
  { id: "org-up", label: "Organisasi ↑", icon: "⊥" },
  { id: "tree-right", label: "Pohon →", icon: "▤" },
  { id: "tree-left", label: "Pohon ←", icon: "▥" },
  { id: "timeline", label: "Linimasa", icon: "⟷" },
  { id: "fishbone", label: "Tulang ikan", icon: "⋙" },
];

const SHAPES: [NodeShape | undefined, string][] = [
  [undefined, "Otomatis"],
  [ "rounded", "Bulat"],
  ["pill", "Pil"],
  ["box", "Kotak"],
  ["ellipse", "Elips"],
  ["line", "Garis"],
  ["none", "Polos"],
];
const LINES: [LineStyle, string][] = [["auto", "Otomatis"], ["curve", "Lengkung"], ["elbow", "Siku"], ["round", "Siku bulat"], ["straight", "Lurus"]];
const TSTYLE: [TopicStyle, string][] = [["auto", "Otomatis"], ["box", "Kotak"], ["pill", "Pil"], ["line", "Garis bawah"], ["none", "Polos"]];

interface Props {
  sheet: Sheet;
  sel: MNode | null;
  selFloat: string | null;
  onSheet(fn: (s: Sheet) => Sheet): void;
  onNodes(fn: (n: Sheet["nodes"]) => Sheet["nodes"]): void;
  onPatch(p: Partial<MNode>): void;
  onStructure(s: StructureId): void;
  onPickNodeImage(): void;
  onPickFloat(): void;
  onPickBg(): void;
  onDeleteFloat(id: string): void;
  onOpenAttach(): void;
  onAttachFiles(f: File[]): void;
  onClose(): void;
}

const Seg = <T,>({ items, value, onPick }: { items: [T, string][]; value: T; onPick(v: T): void }) => (
  <div className="seg wrap">
    {items.map(([v, l]) => (
      <button key={String(v)} className={v === value ? "on" : ""} onClick={() => onPick(v)}>
        {l}
      </button>
    ))}
  </div>
);

export default function FormatPanel(p: Props) {
  const { sheet, sel } = p;
  const [tab, setTab] = useState<"topic" | "map">(sel ? "topic" : "map");
  const depthMax = maxDepth(sheet.nodes, sheet.rootId);

  const FontSelect = ({ value, onChange, withAuto }: { value?: string; onChange(v: string | undefined): void; withAuto?: boolean }) => (
    <select className="select" value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
      {withAuto && <option value="">(ikuti peta)</option>}
      {(["Bawaan", "Arab", "Indonesia / Latin"] as const).map((g) => (
        <optgroup key={g} label={g}>
          {FONTS.filter((f) => f.group === g).map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );

  return (
    <aside className="side inspector">
      <div className="insp-head">
        <div className="seg">
          <button className={tab === "topic" ? "on" : ""} onClick={() => setTab("topic")}>
            Topik
          </button>
          <button className={tab === "map" ? "on" : ""} onClick={() => setTab("map")}>
            Peta
          </button>
        </div>
        <div className="spacer" />
        <button className="btn icon small" onClick={p.onClose}>
          ✕
        </button>
      </div>

      {tab === "topic" && !sel && <p className="muted small">Pilih sebuah topik untuk mengubah gayanya.</p>}
      {tab === "topic" && sel && (
        <>
          <div className="field">
            <span>Warna</span>
            <div className="swatches">
              {NODE_COLORS.map((c) => (
                <button key={c} className={"swatch" + (sel.color === c ? " on" : "")} style={{ background: c }} onClick={() => p.onPatch({ color: c })} aria-label={c} />
              ))}
              <button className="swatch reset" onClick={() => p.onPatch({ color: undefined })} title="Warna otomatis">
                ⟲
              </button>
            </div>
          </div>
          <div className="field">
            <span>Bentuk</span>
            <Seg items={SHAPES} value={sel.shape} onPick={(v) => p.onPatch({ shape: v })} />
          </div>
          <div className="field">
            <span>Font topik</span>
            <FontSelect withAuto value={sel.font} onChange={(v) => p.onPatch({ font: v })} />
          </div>
          <div className="field row">
            <span>Ukuran</span>
            <button className="btn small" onClick={() => p.onPatch({ fontSize: Math.max(8, (sel.fontSize ?? 15) - 2) })}>
              A−
            </button>
            <button className="btn small" onClick={() => p.onPatch({ fontSize: Math.min(64, (sel.fontSize ?? 15) + 2) })}>
              A+
            </button>
            <button className={"btn small" + (sel.bold ? " active" : "")} onClick={() => p.onPatch({ bold: !(sel.bold ?? sel.parentId === null) })}>
              <b>B</b>
            </button>
            <button className={"btn small" + (sel.italic ? " active" : "")} onClick={() => p.onPatch({ italic: !sel.italic })}>
              <i>I</i>
            </button>
            <button className="btn small" onClick={() => p.onPatch({ fontSize: undefined, bold: undefined, italic: undefined, font: undefined })}>
              ⟲
            </button>
          </div>
          <div className="field">
            <span>Warna teks</span>
            <div className="swatches">
              {["#0f172a", "#ffffff", "#dc2626", "#2563eb", "#16a34a", "#9333ea"].map((c) => (
                <button key={c} className={"swatch" + (sel.textColor === c ? " on" : "")} style={{ background: c }} onClick={() => p.onPatch({ textColor: c })} />
              ))}
              <button className="swatch reset" onClick={() => p.onPatch({ textColor: undefined })}>
                ⟲
              </button>
            </div>
          </div>
          <div className="field">
            <span>Gambar pada topik</span>
            <div className="seg wrap">
              <button onClick={p.onPickNodeImage}>{sel.image ? "Ganti gambar" : "＋ Gambar"}</button>
              {sel.image &&
                (["S", "M", "L"] as ImgSize[]).map((s) => (
                  <button key={s} className={sel.image!.size === s ? "on" : ""} onClick={() => p.onPatch({ image: { ...sel.image!, size: s } })}>
                    {s}
                  </button>
                ))}
              {sel.image && <button onClick={() => p.onPatch({ image: undefined })}>Hapus</button>}
            </div>
          </div>
          <div className="field">
            <span>Lampiran (gambar, PDF, PPT…)</span>
            <button className="btn small" onClick={p.onOpenAttach}>
              📎 {sel.attachments?.length ? `${sel.attachments.length} lampiran` : "Tambah lampiran"}
            </button>
          </div>
          <div className="field">
            <span>Urutan</span>
            <div className="seg">
              <button onClick={() => p.onNodes((n) => reorder(n, sel.id, -1))}>↑</button>
              <button onClick={() => p.onNodes((n) => reorder(n, sel.id, 1))}>↓</button>
              <button onClick={() => p.onNodes((n) => outdent(n, sel.id))}>⇤</button>
              <button onClick={() => p.onNodes((n) => indent(n, sel.id))}>⇥</button>
            </div>
          </div>
          <label className="field">
            <span>Catatan (jadi catatan pembicara)</span>
            <textarea className="note-input" rows={4} defaultValue={sel.note ?? ""} key={sel.id} onBlur={(e) => e.target.value !== (sel.note ?? "") && p.onPatch({ note: e.target.value || undefined })} />
          </label>
        </>
      )}

      {tab === "map" && (
        <>
          <div className="field">
            <span>Struktur</span>
            <div className="struct-grid">
              {STRUCTURES.map((s) => (
                <button key={s.id} className={sheet.structure === s.id ? "on" : ""} onClick={() => p.onStructure(s.id)} title={s.label}>
                  <b>{s.icon}</b>
                  <small>{s.label}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>Font peta (Arab &amp; Indonesia)</span>
            <FontSelect value={sheet.font} onChange={(v) => p.onSheet((s) => ({ ...s, font: v ?? "system" }))} />
          </div>
          <div className="field">
            <span>Tema warna</span>
            <div className="palettes">
              {MAP_PALETTES.map((t) => (
                <button key={t.id} className={sheet.theme === t.id ? "on" : ""} onClick={() => p.onSheet((s) => ({ ...s, theme: t.id }))} title={t.name}>
                  {t.colors.slice(0, 5).map((c) => (
                    <i key={c} style={{ background: c }} />
                  ))}
                </button>
              ))}
            </div>
            <label className="check">
              <input type="checkbox" checked={sheet.colored} onChange={(e) => p.onSheet((s) => ({ ...s, colored: e.target.checked }))} /> Cabang berwarna-warni
            </label>
          </div>
          <div className="field">
            <span>Gaya topik</span>
            <Seg items={TSTYLE} value={sheet.topicStyle} onPick={(v) => p.onSheet((s) => ({ ...s, topicStyle: v }))} />
          </div>
          <div className="field">
            <span>Gaya garis</span>
            <Seg items={LINES} value={sheet.lineStyle} onPick={(v) => p.onSheet((s) => ({ ...s, lineStyle: v }))} />
            <label className="check">
              Tebal
              <input type="range" min={0} max={8} value={sheet.lineWidth} onChange={(e) => p.onSheet((s) => ({ ...s, lineWidth: +e.target.value }))} />
              <small>{sheet.lineWidth || "oto"}</small>
            </label>
          </div>
          <div className="field">
            <span>Lipat / buka cabang (untuk kelas interaktif)</span>
            <div className="seg wrap">
              <button onClick={() => p.onNodes((n) => foldToLevel(n, sheet.rootId, Infinity))}>Buka semua</button>
              <button onClick={() => p.onNodes((n) => foldToLevel(n, sheet.rootId, 0))}>Lipat semua</button>
              {Array.from({ length: Math.min(depthMax, 4) }, (_, i) => i + 1).map((l) => (
                <button key={l} onClick={() => p.onNodes((n) => foldToLevel(n, sheet.rootId, l))}>
                  Level {l}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>Latar belakang</span>
            <div className="swatches">
              {["#fbfcff", "#ffffff", "#fff8e7", "#eef6ff", "#f1f5f9", "#0f172a", "#14281d"].map((c) => (
                <button key={c} className={"swatch" + (sheet.bg.color === c ? " on" : "")} style={{ background: c }} onClick={() => p.onSheet((s) => ({ ...s, bg: { ...s.bg, color: c } }))} />
              ))}
              <input type="color" value={sheet.bg.color} onChange={(e) => p.onSheet((s) => ({ ...s, bg: { ...s.bg, color: e.target.value } }))} />
            </div>
            <div className="seg wrap">
              <button onClick={p.onPickBg}>{sheet.bg.imageId ? "Ganti gambar" : "＋ Gambar latar"}</button>
              {sheet.bg.imageId &&
                (["cover", "contain", "tile"] as const).map((f) => (
                  <button key={f} className={sheet.bg.fit === f ? "on" : ""} onClick={() => p.onSheet((s) => ({ ...s, bg: { ...s.bg, fit: f } }))}>
                    {f === "cover" ? "Penuh" : f === "contain" ? "Muat" : "Ubin"}
                  </button>
                ))}
              {sheet.bg.imageId && <button onClick={() => p.onSheet((s) => ({ ...s, bg: { ...s.bg, imageId: undefined } }))}>Hapus</button>}
            </div>
          </div>
          <div className="field">
            <span>Gambar tambahan (bebas diseret &amp; diubah ukuran)</span>
            <div className="seg wrap">
              <button onClick={p.onPickFloat}>＋ Sisipkan gambar</button>
              {p.selFloat && <button onClick={() => p.onDeleteFloat(p.selFloat!)}>🗑 Hapus gambar terpilih</button>}
            </div>
            <small className="muted">{sheet.floats.length} gambar di lembar ini</small>
          </div>
        </>
      )}
    </aside>
  );
}
