import { useEffect, useRef, useState } from "react";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Peramban lama belum punya Promise.withResolvers (dibutuhkan pdf.js)
const P = Promise as unknown as { withResolvers?: () => unknown };
if (!P.withResolvers) {
  P.withResolvers = function <T>() {
    let resolve!: (v: T) => void, reject!: (e: unknown) => void;
    const promise = new Promise<T>((a, b) => ((resolve = a), (reject = b)));
    return { promise, resolve, reject };
  };
}

/** Tampilan PDF yang jalan di HP (peramban seluler tidak bisa menampilkan PDF langsung). */
export default function PdfView({ url, onFail }: { url: string; onFail(): void }) {
  const box = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pages, setPages] = useState(0);
  const [busy, setBusy] = useState(true);
  const zoomRef = useRef(1);
  zoomRef.current = zoom;
  const docRef = useRef<any>(null);
  const token = useRef(0);

  const render = async () => {
    const doc = docRef.current;
    const el = box.current;
    if (!doc || !el) return;
    const my = ++token.current;
    const width = Math.max(200, el.clientWidth - 16) * zoomRef.current;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    el.querySelectorAll("canvas").forEach((c) => c.remove());
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      if (my !== token.current) return;
      const vp0 = page.getViewport({ scale: 1 });
      const scale = width / vp0.width;
      const vp = page.getViewport({ scale: scale * dpr });
      const cv = document.createElement("canvas");
      cv.width = Math.floor(vp.width);
      cv.height = Math.floor(vp.height);
      cv.style.width = Math.floor(vp.width / dpr) + "px";
      cv.style.height = Math.floor(vp.height / dpr) + "px";
      cv.className = "pdf-page";
      el.appendChild(cv);
      await page.render({ canvasContext: cv.getContext("2d")!, viewport: vp }).promise;
    }
    setBusy(false);
  };

  useEffect(() => {
    let dead = false;
    setBusy(true);
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        const doc = await pdfjs.getDocument({ url }).promise;
        if (dead) return;
        docRef.current = doc;
        setPages(doc.numPages);
        await render();
      } catch {
        if (!dead) onFail();
      }
    })();
    return () => {
      dead = true;
      token.current++;
      docRef.current?.destroy?.();
      docRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => {
    if (docRef.current) {
      setBusy(true);
      render();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  return (
    <div className="pdf-wrap">
      <div className="pdf-scroll" ref={box} />
      {busy && <div className="pdf-busy muted small">Memuat PDF…</div>}
      <div className="pdf-ctrl">
        <button className="btn icon small" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}>−</button>
        <span className="small">{pages ? `${pages} hlm · ` : ""}{Math.round(zoom * 100)}%</span>
        <button className="btn icon small" onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))}>＋</button>
      </div>
    </div>
  );
}
