# Map It (v2)

Aplikasi PWA peta pikiran dengan **Presentasi** (tampil per langkah & video). Berjalan offline, data tersimpan di perangkat (IndexedDB).

## Menjalankan
```bash
npm install
npm run dev        # pengembangan
npm run build      # produksi (hasil di dist/, termasuk precache.json untuk offline)
npm run preview    # uji hasil build; pasang sebagai aplikasi lewat Chrome/Edge
```
Untuk dipasang di ponsel, sajikan folder `dist/` lewat HTTPS (Netlify, Vercel, GitHub Pages, dsb.).

## Yang baru di v2
1. **Lembar (sheet)** di kiri bawah seperti Excel: satu berkas berisi banyak peta. Klik `+` untuk menambah, klik dua kali untuk ganti nama, menu `⋯` / klik kanan untuk gandakan, geser, hapus.
2. **Tombol ⊕ / ⊖ pada topik** untuk menampilkan/menyembunyikan cabang (juga tombol Spasi). Di panel Format › Peta ada *Buka semua, Lipat semua, Level 1–4* untuk kelas interaktif.
3. **Presentasi (drill-down)**: judul di tengah → bergeser ke kiri dengan kurung kurawal → anak muncul satu per satu → menyelam ke cabang berikutnya; daftar ▶ untuk cabang berisi poin; topik induk bergaris bawah di kiri atas. Gerak antar langkah mulus, otomatis dicerminkan untuk teks Arab (RTL). Bisa mulai dari topik terpilih, memilih topik yang disertakan, tema, gambar latar, ekspor video MP4/WebM.
4. **Lampiran per topik**: gambar, PDF, PPT, Word, Excel, audio, video (ikon 📎 pada topik). PDF/gambar tampil langsung, PPT dll. diunduh/dibuka dengan aplikasinya.
5. **Gambar**: gambar di dalam topik (S/M/L), gambar tambahan bebas yang bisa diseret & diubah ukuran, gambar/warna latar peta, gambar latar Pitch.
6. **14 struktur**: peta pikiran (2 sisi/kanan/kiri), bagan logika (kanan/kiri/dua sisi), kurung kurawal (kanan/kiri), organisasi (bawah/atas), pohon (kanan/kiri), linimasa, tulang ikan. Plus gaya garis, ketebalan, bentuk topik, 6 tema warna.
7. **Font**: Arab (Amiri, Scheherazade New, Noto Naskh, Cairo, Tajawal, Aref Ruqaa) dan Indonesia/Latin (Inter, Poppins, Nunito, Merriweather, Patrick Hand), global per lembar dan per topik. Font ikut ter-bundel sehingga bekerja offline.

## Yang baru di v3
- **Ekspor lengkap** (tombol Ekspor): PNG, PDF, SVG, format lintas aplikasi. Ukuran: PDF A3/A4/A5/B4/B5/Letter dst; gambar rasio 1:1, 3:4, 4:3, 16:9, dll. Isi peta otomatis dipas proporsional. Pilihan bingkai/tepi, warna bingkai, judul, PNG transparan, pratinjau langsung, dan tombol Bagikan.
- **Format lintas aplikasi**: buka berkas peta pikiran dari aplikasi lain (`.xmind`) dan ekspor agar terbuka di aplikasi serupa (struktur, catatan, status lipat; gaya/gambar/lampiran tidak ikut).
- **Arsir** pada topik/subtopik (diagonal, silang, titik, garis) per topik atau semua.
- **Multi-pilih** subtopik (Shift/Ctrl-klik, tombol ☑, atau ⫴ Saudara) untuk mengubah gaya sekaligus.
- **Ringkasan (Summary)**: pilih beberapa topik bersaudara (☑ / Shift-klik), tekan ⎬ Ringkasan atau Ctrl+]; muncul kurung + topik ringkasan yang bisa diedit/digaya. Ikut tampil di ekspor.
- **Lembar Tabel** (mis. untuk tashrif): tombol ＋ lembar › Tabel kosong / Tashrif istilahi / Tashrif lughawi. Sel Arab (font Amiri dll.), arah kanan→kiri, tempel dari Word/Excel, sisip/hapus baris & kolom, warna/tebal/rata, header, ekspor PDF/PNG/SVG/Markdown, seret batas kolom untuk mengatur lebar (tetap tepi ke tepi), dan **Tampilkan bertahap** (per baris, per kolom, per sel → atau ↓, atau ketuk sel untuk memunculkan).
- **Peta → Tabel**: di panel Format › tab Peta › "Ubah menjadi tabel" (per tingkat atau per cabang); peta asli tetap ada.
- **Impor berkas ke lembar baru**: tombol ＋ lembar › Impor berkas (.mapit, lintas aplikasi, .json, .md/.txt, .csv/.tsv → tabel). Beranda juga menerima .csv/.tsv.
- **Tab Pintasan** (tombol ? atau tekan ?): daftar tombol keyboard/mouse/sentuh; tab Panduan menjelaskan tombol-tombol layar.
- Perbaikan tampilan HP: tombol ⊕/⊖ lebih besar dan mudah diketuk, zoom awal terbaca, bilah alat dapat digulir.
- PDF berupa gambar (teks tidak bisa diseleksi).

## Berkas
- `.mapit` (dulu `.mindpitch`) = zip berisi semua lembar + lampiran (cadangan penuh). Impor dari beranda.
- Ekspor: PNG, PDF, SVG, Markdown, format lintas aplikasi (.xmind), dan .mapit. Impor: .xmind, .mapit (.mindpitch lama tetap bisa dibuka), Markdown/teks berindentasi, JSON.

## Pintasan
Tab = anak · Enter = saudara · F2 = ubah · Spasi = lipat/buka · Delete = hapus · Alt+↑↓←→ = urutan/indentasi · Ctrl+Z/Y · Ctrl+0 = pas layar.
Presentasi: ←/→ atau ketuk, `A` putar otomatis, `N` catatan, Esc keluar.

## Belum ada
Batas (Boundary) dan Relasi dari aplikasi sejenis; Ringkasan belum ikut ke berkas lintas aplikasi; suara pada video Presentasi.

## Konektor MCP untuk Claude

Map It menyediakan server MCP (Streamable HTTP, tanpa login, tanpa penyimpanan) di `https://mapit-anwar.vercel.app/mcp`
(kode: `api/mcp.ts`). Tool:

| Tool | Fungsi |
| --- | --- |
| `create_mindmap` | Peta pikiran dari outline Markdown (`- ` bertingkat), struktur opsional |
| `create_table` | Lembar tabel dari daftar baris (Arab/harakat didukung, RTL otomatis) |
| `create_workbook` | Satu berkas berisi beberapa lembar campuran (peta + tabel) |

Tool mengembalikan **tautan** `…/#import=…` (spesifikasi dipadatkan deflate+base64url). Saat tautan dibuka, aplikasi
meminta konfirmasi lalu membuat berkas di perangkat pengguna (`src/shareLink.ts`). Server tidak menyimpan data apa pun.

Pasang di Claude: Pengaturan › Konektor › *Tambah konektor kustom* › URL di atas (ketersediaan bergantung paket).
Uji lokal: `npx esbuild api/mcp.ts --bundle --platform=node --format=esm --outfile=mcp.mjs`, jalankan dengan `http.createServer`,
lalu sambungkan klien MCP ke `http://localhost:PORT/mcp`. Variabel `APP_URL` mengubah alamat dasar tautan.
