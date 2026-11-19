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

## Berkas
- `.mindpitch` = zip berisi semua lembar + lampiran (cadangan penuh). Impor dari beranda.
- Ekspor lembar aktif: PNG, SVG, Markdown. Impor juga Markdown/teks berindentasi dan JSON.

## Pintasan
Tab = anak · Enter = saudara · F2 = ubah · Spasi = lipat/buka · Delete = hapus · Alt+↑↓←→ = urutan/indentasi · Ctrl+Z/Y · Ctrl+0 = pas layar.
Pitch: ←/→ atau ketuk, `A` putar otomatis, `N` catatan, Esc keluar.

## Belum ada
Ringkasan (Summary), Batas (Boundary), dan Relasi dari toolbar XMind; suara pada video Pitch.
