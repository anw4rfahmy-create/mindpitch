import { FONTS } from "./fonts";
import { NODE_COLORS } from "./nodeStyle";
import { MAP_PALETTES } from "./themes";
import { reorder, outdent, indent, foldToLevel, maxDepth } from "./model";
import { PATTERNS } from "./patterns";
import { ImgSize, PatternId, LineStyle, MNode, NodeShape, Sheet, StructureId, TopicStyle } from "./types";

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
  count: number;
  tab: "topic" | "map" | "keys" | "help";
  onTab(t: "topic" | "map" | "keys" | "help"): void;
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
  const { tab, onTab: setTab } = p;
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
          {!p.sheet.table && <button className={tab === "topic" ? "on" : ""} onClick={() => setTab("topic")}>
            Topik
          </button>}
          {!p.sheet.table && <button className={tab === "map" ? "on" : ""} onClick={() => setTab("map")}>
            Peta
          </button>}
          <button className={tab === "keys" ? "on" : ""} onClick={() => setTab("keys")}>
            Pintasan
          </button>
          <button className={tab === "help" ? "on" : ""} onClick={() => setTab("help")}>
            Panduan
          </button>
        </div>
        <div className="spacer" />
        <button className="btn icon small" onClick={p.onClose}>
          ✕
        </button>
      </div>


      {tab === "keys" && (
        <div className="guide keys">
          <h4>Topik</h4>
          <table className="keytable"><tbody>
            <tr><td><kbd>Tab</kbd></td><td>Tambah anak</td></tr>
            <tr><td><kbd>Enter</kbd></td><td>Tambah saudara</td></tr>
            <tr><td><kbd>F2</kbd></td><td>Ubah teks (atau klik dua kali)</td></tr>
            <tr><td><kbd>Spasi</kbd></td><td>Lipat / buka cabang</td></tr>
            <tr><td><kbd>Delete</kbd></td><td>Hapus topik</td></tr>
            <tr><td><kbd>Ctrl</kbd> + <kbd>]</kbd></td><td>Buat Ringkasan (kurung) dari topik terpilih</td></tr>
            <tr><td><kbd>Esc</kbd></td><td>Batal pilih</td></tr>
          </tbody></table>
          <h4>Pindah &amp; susun</h4>
          <table className="keytable"><tbody>
            <tr><td><kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd></td><td>Pindah pilihan antar topik</td></tr>
            <tr><td><kbd>Alt</kbd> + <kbd>↑ / ↓</kbd></td><td>Naik / turun urutan</td></tr>
            <tr><td><kbd>Alt</kbd> + <kbd>→</kbd></td><td>Jadikan anak saudara di atasnya (indentasi)</td></tr>
            <tr><td><kbd>Alt</kbd> + <kbd>←</kbd></td><td>Naikkan satu tingkat</td></tr>
          </tbody></table>
          <h4>Pilih banyak</h4>
          <table className="keytable"><tbody>
            <tr><td>Shift / Ctrl + klik</td><td>Tambah / buang dari pilihan</td></tr>
            <tr><td>⫴ Saudara</td><td>Pilih semua topik selevel</td></tr>
          </tbody></table>
          <h4>Umum</h4>
          <table className="keytable"><tbody>
            <tr><td><kbd>Ctrl</kbd> + <kbd>Z</kbd></td><td>Urungkan (undo)</td></tr>
            <tr><td><kbd>Ctrl</kbd> + <kbd>Y</kbd></td><td>Ulangi (redo)</td></tr>
            <tr><td><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd></td><td>Ulangi (redo)</td></tr>
            <tr><td><kbd>Ctrl</kbd> + <kbd>0</kbd></td><td>Pas layar</td></tr>
            <tr><td><kbd>Ctrl</kbd> + <kbd>+</kbd></td><td>Perbesar</td></tr>
            <tr><td><kbd>Ctrl</kbd> + <kbd>-</kbd></td><td>Perkecil</td></tr>
            <tr><td><kbd>?</kbd></td><td>Buka tab Pintasan ini</td></tr>
          </tbody></table>
          <h4>Mouse / sentuh</h4>
          <table className="keytable"><tbody>
            <tr><td>Seret kanvas</td><td>Geser peta</td></tr>
            <tr><td>Roda mouse / cubit</td><td>Zoom</td></tr>
            <tr><td>Seret topik ke topik lain</td><td>Pindahkan topik</td></tr>
            <tr><td>Ketuk dua kali</td><td>Ubah teks</td></tr>
          </tbody></table>
          <h4>Presentasi</h4>
          <table className="keytable"><tbody>
            <tr><td><kbd>← / →  atau ketuk</kbd></td><td>Langkah sebelum / berikut</td></tr>
            <tr><td><kbd>A</kbd></td><td>Putar otomatis</td></tr>
            <tr><td><kbd>N</kbd></td><td>Catatan</td></tr>
            <tr><td><kbd>Esc</kbd></td><td>Keluar</td></tr>
          </tbody></table>
        </div>
      )}

      {tab === "help" && (
        <div className="guide">
          <h4>Bilah atas</h4>
          <ul>
            <li><b>←</b> kembali ke beranda (otomatis tersimpan)</li>
            <li><b>↶ ↷</b> urungkan / ulangi</li>
            <li><b>☰ Outline</b> edit sebagai daftar berindentasi</li>
            <li><b>🎨 Format</b> panel ini: Topik, Peta, Panduan</li>
            <li><b>⬇ Ekspor</b> PDF, PNG, SVG (pilih ukuran &amp; bingkai), format lintas aplikasi, Map It, Markdown</li>
            <li><b>🎬 Presentasi</b> tampil per langkah &amp; ekspor video</li>
          </ul>
          <h4>Bilah bawah topik</h4>
          <ul>
            <li><b>＋ Anak / ＋ Saudara</b> tambah topik</li>
            <li><b>✎ Ubah</b> ganti teks (atau klik dua kali)</li>
            <li><b>⊖ Lipat / ⊕ Buka</b> sembunyikan/tampilkan cabang</li>
            <li><b>📎</b> lampiran: gambar, PDF, PPT, dll. &nbsp; <b>🖼</b> gambar di dalam topik</li>
            <li><b>☑</b> mode pilih banyak: ketuk beberapa topik, lalu ubah gayanya bersamaan</li>
            <li><b>⎬ Ringkasan</b> kurung yang merangkum topik terpilih (pilih beberapa saudara dengan ☑ dulu); teksnya bisa diubah &amp; digayakan seperti topik biasa</li>
            <li><b>⫴ Saudara</b> pilih semua topik selevel dalam satu induk</li>
            <li><b>🗑</b> hapus topik terpilih</li>
          </ul>
          <h4>Pada topik</h4>
          <ul>
            <li><b>⊖ / ⊕ kecil di ujung topik</b> melipat atau membuka cabang itu</li>
            <li>Seret topik ke topik lain untuk memindahkan</li>
            <li>Tab Topik: warna, bentuk, <b>arsir</b>, font, ukuran, gambar, catatan</li>
          </ul>
          <h4>Lembar tabel (mis. tashrif)</h4>
          <ul>
            <li>Tombol <b>＋</b> di kiri bawah › pilih <b>Tabel</b>: kosong, <b>Tashrif istilahi</b>, atau <b>Tashrif lughawi</b> (contoh kata نَصَرَ, tinggal diganti)</li>
            <li>Ketik langsung di sel; <b>tempel</b> tabel dari Word/Excel (Ctrl+V) mengisi banyak sel sekaligus</li>
            <li>Klik nomor baris/kolom untuk memilihnya, lalu atur warna, huruf tebal, rata teks, atau sisipkan/hapus</li>
            <li><b>⇠ Arab</b>: kolom pertama di kanan, font Arab &amp; Latin dipilih terpisah</li>
            <li><b>▶ Tampilkan bertahap</b>: layar penuh, jawaban muncul per baris/kolom/sel</li>
          </ul>
          <h4>Peta &amp; lembar</h4>
          <ul>
            <li>Tab <b>Peta</b>: struktur (14 jenis), font, tema warna, arsir semua topik, garis, lipat per level, latar &amp; gambar</li>
            <li>Tab lembar di kiri bawah: <b>＋</b> tambah, klik dua kali ganti nama, <b>⋯</b> gandakan/geser/hapus</li>
          </ul>
          <h4>Layar sentuh (HP)</h4>
          <ul>
            <li>Geser satu jari = menggeser peta · cubit = zoom</li>
            <li>Ketuk dua kali topik = ubah teks</li>
            <li>Pilih banyak: aktifkan tombol <b>☑</b> lalu ketuk topik-topiknya</li>
          </ul>
          <h4>Pintasan keyboard</h4>
          <p className="muted small">Lihat tab <b>Pintasan</b> (atau tekan <kbd>?</kbd>).</p>
        </div>
      )}

      {tab === "topic" && !sel && <p className="muted small">Pilih sebuah topik untuk mengubah gayanya.</p>}
      {tab === "topic" && sel && (
        <>
          {p.count > 1 && <div className="multi-banner">✔ {p.count} topik dipilih — perubahan berlaku untuk semuanya</div>}
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
            <span>Arsir (pola isi)</span>
            <div className="pat-grid">
              <button className={!sel.pattern ? "on" : ""} onClick={() => p.onPatch({ pattern: undefined })} title="Ikuti peta">
                Ikuti
              </button>
              {PATTERNS.map((pt) => (
                <button key={pt.id} className={sel.pattern === pt.id ? "on" : ""} onClick={() => p.onPatch({ pattern: pt.id as PatternId })}>
                  {pt.label}
                </button>
              ))}
            </div>
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
          {p.count === 1 && <div className="field">
            <span>Urutan</span>
            <div className="seg">
              <button onClick={() => p.onNodes((n) => reorder(n, sel.id, -1))}>↑</button>
              <button onClick={() => p.onNodes((n) => reorder(n, sel.id, 1))}>↓</button>
              <button onClick={() => p.onNodes((n) => outdent(n, sel.id))}>⇤</button>
              <button onClick={() => p.onNodes((n) => indent(n, sel.id))}>⇥</button>
            </div>
          </div>}
          {p.count === 1 && <label className="field">
            <span>Catatan (jadi catatan pembicara)</span>
            <textarea className="note-input" rows={4} defaultValue={sel.note ?? ""} key={sel.id} onBlur={(e) => e.target.value !== (sel.note ?? "") && p.onPatch({ note: e.target.value || undefined })} />
          </label>}
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
            <span>Arsir semua topik</span>
            <div className="pat-grid">
              {PATTERNS.map((pt) => (
                <button key={pt.id} className={(sheet.pattern ?? "none") === pt.id ? "on" : ""} onClick={() => p.onSheet((s) => ({ ...s, pattern: pt.id === "none" ? undefined : pt.id }))}>
                  {pt.label}
                </button>
              ))}
            </div>
            <small className="muted">Topik tertentu bisa diubah lewat tab Topik.</small>
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
