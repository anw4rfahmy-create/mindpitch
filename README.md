# MindPitch

Aplikasi peta pikiran (mind map) berbentuk PWA dengan fitur **Pitch**: peta otomatis menjadi slide, bisa dipresentasikan, dan diekspor ke video.

## Menjalankan

```bash
npm install
npm run dev        # mode pengembangan
npm run build      # build produksi ke folder dist/
npm run preview    # uji hasil build (service worker aktif di build produksi)
```

Hasil `dist/` bisa di-hosting di mana saja yang memakai HTTPS (Vercel, Netlify, GitHub Pages, dll.).
Setelah dibuka di Chrome/Edge/Safari, aplikasi bisa dipasang ke layar utama dan berjalan offline.

## Fitur

- Editor: tambah/ubah/hapus topik, drag & drop untuk pindah induk, lipat/buka, zoom & pan (roda mouse, pinch), undo/redo, warna, bentuk, catatan.
- Tata letak: peta dua sisi, bagan logika, bagan organisasi. Mode outline untuk mengetik cepat.
- Simpan otomatis di perangkat (IndexedDB). Impor/ekspor JSON, Markdown, PNG, SVG.
- **Pitch**: slide dari cabang utama (atau sub-cabang), 5 tema, 3 gaya isi (poin, kartu, peta), transisi, tampil bertahap, catatan pembicara, mode presentasi layar penuh, putar otomatis, ekspor video (MP4/WebM, direkam real-time).

## Pintasan keyboard

| Tombol | Aksi |
| --- | --- |
| Tab / Enter | Tambah topik anak / saudara |
| F2 atau ketuk dua kali | Ubah teks |
| Delete | Hapus topik |
| Spasi | Lipat/buka cabang |
| Panah | Pindah pilihan |
| Alt + panah | Ubah urutan / indent / outdent |
| Ctrl+Z / Ctrl+Y | Urungkan / ulangi |
| Ctrl+0, Ctrl +/- | Pas layar, zoom |

Presentasi: panah/spasi untuk maju-mundur, `A` otomatis, `N` catatan, `Esc` keluar.

## Struktur kode

- `src/model.ts` operasi pohon, `src/layout.ts` algoritma tata letak
- `src/Canvas.tsx` kanvas SVG, `src/Editor.tsx` antarmuka editor
- `src/slides.ts`, `src/pitchRender.ts`, `src/pitchPlayer.ts`, `src/videoExport.ts` fitur Pitch
- `public/sw.js`, `public/manifest.webmanifest` bagian PWA

Nama aplikasi bisa diganti di `index.html`, `public/manifest.webmanifest`, dan `src/Home.tsx`.
