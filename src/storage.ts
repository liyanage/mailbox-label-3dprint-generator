export interface SavedFont { name: string; bytes: ArrayBuffer }
const DB = 'mailbox-labels';

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('preferences');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('preferences', mode);
    const request = action(tx.objectStore('preferences'));
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Browser storage is unavailable.')); };
  });
}

export const readFont = (): Promise<SavedFont | undefined> => transaction('readonly', store => store.get('font'));
export const saveFont = (font: SavedFont) => transaction('readwrite', store => store.put(font, 'font'));
export const forgetFont = () => transaction('readwrite', store => store.delete('font'));
