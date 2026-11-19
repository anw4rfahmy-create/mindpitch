// Penyimpanan berkas (gambar, PDF, PPT, dll.) di IndexedDB + cache URL/gambar untuk tampilan.
import { uid } from "./model";

const DB = "mindpitch";
const VERSION = 2;

export interface StoredFile {
  id: string;
  docId: string;
  name: string;
  type: string;
  size: number;
  blob: Blob;
}

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("docs")) db.createObjectStore("docs", { keyPath: "id" });
      if (!db.objectStoreNames.contains("files")) {
        const s = db.createObjectStore("files", { keyPath: "id" });
        s.createIndex("docId", "docId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const r = fn(t.objectStore(store));
        t.oncomplete = () => {
          db.close();
          resolve(r.result);
        };
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

export const MAX_FILE_BYTES = 60 * 1024 * 1024;

export async function putFile(docId: string, blob: Blob, name: string, type?: string, id = uid()): Promise<string> {
  const rec: StoredFile = { id, docId, name, type: type || blob.type || guessMime(name), size: blob.size, blob };
  await run("files", "readwrite", (s) => s.put(rec));
  return id;
}

export const getFile = (id: string) => run<StoredFile | undefined>("files", "readonly", (s) => s.get(id));

export const filesOfDoc = (docId: string) =>
  run<StoredFile[]>("files", "readonly", (s) => s.index("docId").getAll(docId));

export const deleteFile = (id: string) => run<undefined>("files", "readwrite", (s) => s.delete(id));

export async function deleteFilesExcept(docId: string, keep: Set<string>) {
  const all = await filesOfDoc(docId);
  await Promise.all(all.filter((f) => !keep.has(f.id)).map((f) => deleteFile(f.id)));
  for (const f of all) if (!keep.has(f.id)) forget(f.id);
}

export async function deleteAllFilesOfDoc(docId: string) {
  await deleteFilesExcept(docId, new Set());
}

export function guessMime(name: string): string {
  const ext = name.toLowerCase().split(".").pop() || "";
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    txt: "text/plain",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
  };
  return map[ext] || "application/octet-stream";
}

export function kindOf(mime: string, name = ""): "image" | "pdf" | "ppt" | "doc" | "sheet" | "audio" | "video" | "other" {
  const m = mime || guessMime(name);
  if (m.startsWith("image/")) return "image";
  if (m === "application/pdf") return "pdf";
  if (m.includes("presentation") || m.includes("powerpoint")) return "ppt";
  if (m.includes("word") || m === "text/plain") return "doc";
  if (m.includes("spreadsheet") || m.includes("excel")) return "sheet";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("video/")) return "video";
  return "other";
}

// ---------- cache URL & gambar ----------
const urls = new Map<string, string>();
const loading = new Set<string>();
const images = new Map<string, HTMLImageElement>();
const listeners = new Set<() => void>();
let version = 0;

export const subscribeFiles = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
export const filesVersion = () => version;
const notify = () => {
  version++;
  listeners.forEach((l) => l());
};

/** Kembalikan URL blob bila sudah dimuat; bila belum, mulai memuat dan beri tahu pelanggan saat siap. */
export function urlOf(fileId?: string): string | undefined {
  if (!fileId) return undefined;
  const hit = urls.get(fileId);
  if (hit) return hit;
  if (!loading.has(fileId)) {
    loading.add(fileId);
    getFile(fileId)
      .then((f) => {
        if (f) urls.set(fileId, URL.createObjectURL(f.blob));
      })
      .catch(() => {})
      .finally(() => {
        loading.delete(fileId);
        notify();
      });
  }
  return undefined;
}

export async function urlOfAsync(fileId: string): Promise<string | undefined> {
  const hit = urls.get(fileId);
  if (hit) return hit;
  const f = await getFile(fileId);
  if (!f) return undefined;
  const u = URL.createObjectURL(f.blob);
  urls.set(fileId, u);
  return u;
}

function forget(id: string) {
  const u = urls.get(id);
  if (u) URL.revokeObjectURL(u);
  urls.delete(id);
  images.delete(id);
}

/** Muat gambar (HTMLImageElement) untuk digambar di kanvas Pitch. */
export async function loadImage(fileId: string): Promise<HTMLImageElement | null> {
  const hit = images.get(fileId);
  if (hit) return hit;
  const u = await urlOfAsync(fileId);
  if (!u) return null;
  const img = new Image();
  try {
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("gambar rusak"));
      img.src = u;
    });
  } catch {
    return null;
  }
  images.set(fileId, img);
  return img;
}

export const imageSync = (fileId?: string) => (fileId ? images.get(fileId) ?? null : null);

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

export async function fileDataUrl(fileId: string): Promise<string | undefined> {
  const f = await getFile(fileId);
  return f ? blobToDataUrl(f.blob) : undefined;
}

/** Perkecil gambar besar agar penyimpanan tetap ringan. Mengembalikan blob baru + rasio lebar/tinggi. */
export async function prepareImage(file: File | Blob, maxSide = 2000): Promise<{ blob: Blob; ar: number; w: number; h: number }> {
  const type = file.type || "";
  if (type === "image/svg+xml" || type === "image/gif") {
    const dim = await naturalSize(file);
    return { blob: file, ar: dim.w / dim.h, ...dim };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("Berkas bukan gambar yang valid"));
      img.src = url;
    });
    const w = img.naturalWidth || 1;
    const h = img.naturalHeight || 1;
    const s = Math.min(1, maxSide / Math.max(w, h));
    if (s >= 1) return { blob: file, ar: w / h, w, h };
    const cv = document.createElement("canvas");
    cv.width = Math.round(w * s);
    cv.height = Math.round(h * s);
    cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
    const out = await new Promise<Blob>((res, rej) =>
      cv.toBlob((b) => (b ? res(b) : rej(new Error("Gagal memproses gambar"))), type === "image/png" ? "image/png" : "image/jpeg", 0.9)
    );
    return { blob: out, ar: cv.width / cv.height, w: cv.width, h: cv.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function naturalSize(file: Blob): Promise<{ w: number; h: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("Berkas bukan gambar yang valid"));
      img.src = url;
    });
    return { w: img.naturalWidth || 300, h: img.naturalHeight || 200 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadStored(f: { blob: Blob; name: string }) {
  const u = URL.createObjectURL(f.blob);
  const a = document.createElement("a");
  a.href = u;
  a.download = f.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
}
