import { filesOfDoc, deleteAllFilesOfDoc, openDb, putFile } from "./files";
import { normalizeWorkbook, uid } from "./model";
import { Workbook } from "./types";

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction("docs", mode);
        const r = fn(t.objectStore("docs"));
        t.oncomplete = () => {
          db.close();
          resolve(r.result);
        };
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

export const listDocs = async (): Promise<Workbook[]> => {
  const raw = await run<any[]>("readonly", (s) => s.getAll());
  const out = raw.map((r) => normalizeWorkbook(r)).filter(Boolean) as Workbook[];
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
};

export const getDoc = async (id: string) => {
  const raw = await run<any>("readonly", (s) => s.get(id));
  return raw ? normalizeWorkbook(raw) : null;
};

export const saveDoc = (wb: Workbook) => run<IDBValidKey>("readwrite", (s) => s.put(wb));

export async function deleteDoc(id: string) {
  await run<undefined>("readwrite", (s) => s.delete(id));
  await deleteAllFilesOfDoc(id).catch(() => {});
}

/** Salin berkas kerja beserta seluruh lampiran/gambarnya dengan id baru. */
export async function duplicateDoc(wb: Workbook): Promise<Workbook> {
  const newId = uid();
  const files = await filesOfDoc(wb.id);
  const map = new Map<string, string>();
  for (const f of files) {
    const nid = uid();
    map.set(f.id, nid);
    await putFile(newId, f.blob, f.name, f.type, nid);
  }
  const remap = (id?: string) => (id ? map.get(id) ?? id : id);
  const copy: Workbook = JSON.parse(JSON.stringify(wb));
  copy.id = newId;
  copy.title = wb.title + " (salinan)";
  copy.createdAt = copy.updatedAt = Date.now();
  for (const s of copy.sheets) {
    if (s.bg.imageId) s.bg.imageId = remap(s.bg.imageId);
    if (s.pitch.bgImageId) s.pitch.bgImageId = remap(s.pitch.bgImageId);
    s.floats.forEach((f) => (f.fileId = remap(f.fileId)!));
    if (s.table) for (const k in s.table.style) s.table.style[k].att?.forEach((a) => (a.id = remap(a.id)!));
    for (const id in s.nodes) {
      const n = s.nodes[id];
      if (n.image) n.image.fileId = remap(n.image.fileId)!;
      n.attachments?.forEach((a) => (a.id = remap(a.id)!));
    }
  }
  await saveDoc(copy);
  return copy;
}
