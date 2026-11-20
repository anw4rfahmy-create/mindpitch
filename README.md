# MindPitch (v2)

Aplikasi PWA peta pikiran bergaya XMind, dengan **Pitch** (presentasi & video). Berjalan offline, data tersimpan di perangkat (IndexedDB).

## Menjalankan
```bash
npm install
npm run dev        # pengembangan
npm run build      # produksi (hasil di dist/, termasuk precache.json untuk offline)
npm run preview    # uji hasil build; pasang sebagai aplikasi lewat Chrome/Edge
```
Untuk dipasang di ponsel, sajikan folder `dist/` lewat HTTPS (Netlify, Vercel, GitHub Pages, dsb.).

## Yang baru di v2
1. **Lembar (sheet)** di kiri bawah seperti Excel/XMind: satu berkas berisi banyak peta. Klik `+` untuk menambah, klik dua kali untuk ganti nama, menu `⋯` / klik kanan untuk gandakan, geser, hapus.
2. **Tombol ⊕ / ⊖ pada topik** untuk menampilkan/menyembunyikan cabang (juga tombol Spasi). Di panel Format › Peta ada *Buka semua, Lipat semua, Level 1–4* untuk kelas interaktif.
3. **Pitch ala XMind (drill-down)**: judul di tengah → bergeser ke kiri dengan kurung kurawal → anak muncul satu per satu → menyelam ke cabang berikutnya; daftar ▶ untuk cabang berisi poin; topik induk bergaris bawah di kiri atas. Gerak antar langkah mulus, otomatis dicerminkan untuk teks Arab (RTL). Bisa mulai dari topik terpilih, memilih topik yang disertakan, tema, gambar latar, ekspor video MP4/WebM.
4. **Lampiran per topik**: gambar, PDF, PPT, Word, Excel, audio, video (ikon 📎 pada topik). PDF/gambar tampil langsung, PPT dll. diunduh/dibuka dengan aplikasinya.
5. **Gambar**: gambar di dalam topik (S/M/L), gambar tambahan bebas yang bisa diseret & diubah ukuran, gambar/warna latar peta, gambar latar Pitch.
6. **14 struktur**: peta pikiran (2 sisi/kanan/kiri), bagan logika (kanan/kiri/dua sisi), kurung kurawal (kanan/kiri), organisasi (bawah/atas), pohon (kanan/kiri), linimasa, tulang ikan. Plus gaya garis, ketebalan, bentuk topik, 6 tema warna.
7. **Font**: Arab (Amiri, Scheherazade New, Noto Naskh, Cairo, Tajawal, Aref Ruqaa) dan Indonesia/Latin (Inter, Poppins, Nunito, Merriweather, Patrick Hand), global per lembar dan per topik. Font ikut ter-bundel sehingga bekerja offline.

## Yang baru di v3
- **Ekspor lengkap** (tombol Ekspor): PNG, PDF, SVG, XMind. Ukuran: PDF A3/A4/A5/B4/B5/Letter dst; gambar rasio 1:1, 3:4, 4:3, 16:9, dll. Isi peta otomatis dipas proporsional. Pilihan bingkai/tepi, warna bingkai, judul, PNG transparan, pratinjau langsung, dan tombol Bagikan.
- **XMind**: buka berkas `.xmind` dan ekspor agar terbuka di XMind (struktur, catatan, status lipat; gaya/gambar/lampiran tidak ikut).
- **Arsir** pada topik/subtopik (diagonal, silang, titik, garis) per topik atau semua.
- **Multi-pilih** subtopik (Shift/Ctrl-klik, tombol ☑, atau ⫴ Saudara) untuk mengubah gaya sekaligus.
- **Tab Panduan** di panel Format (tombol ?).
- Perbaikan tampilan HP: tombol ⊕/⊖ lebih besar dan mudah diketuk, zoom awal terbaca, bilah alat dapat digulir.
- PDF berupa gambar (teks tidak bisa diseleksi).

## Berkas
- `.mindpitch` = zip berisi semua lembar + lampiran (cadangan penuh). Impor dari beranda.
- Ekspor: PNG, PDF, SVG, Markdown, XMind (.xmind), dan .mindpitch. Impor: .xmind, .mindpitch, Markdown/teks berindentasi, JSON.

## Pintasan
Tab = anak · Enter = saudara · F2 = ubah · Spasi = lipat/buka · Delete = hapus · Alt+↑↓←→ = urutan/indentasi · Ctrl+Z/Y · Ctrl+0 = pas layar.
Pitch: ←/→ atau ketuk, `A` putar otomatis, `N` catatan, Esc keluar.

## Belum ada
Ringkasan (Summary), Batas (Boundary), dan Relasi dari toolbar XMind; suara pada video Pitch.
