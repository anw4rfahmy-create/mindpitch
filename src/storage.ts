import { MapDoc } from "./types";

const DB = "mindpitch";
const STORE = "docs";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => {
      db.close();
      resolve(r.result);
    };
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const listDocs = async (): Promise<MapDoc[]> => {
  const all = await tx<MapDoc[]>("readonly", (s) => s.getAll());
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
};

export const getDoc = (id: string) =>
  tx<MapDoc | undefined>("readonly", (s) => s.get(id));

export const saveDoc = (doc: MapDoc) =>
  tx<IDBValidKey>("readwrite", (s) => s.put(doc));

export const deleteDoc = (id: string) =>
  tx<undefined>("readwrite", (s) => s.delete(id));
