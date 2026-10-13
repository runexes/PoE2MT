import { DB_NAME, HANDLE_KEY, STORE_NAME } from "../core/constants.js";

function db() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function completeTransaction(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function saveHandle(handle) {
  const database = await db();
  const tx = database.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
  await completeTransaction(tx);
  database.close();
}

export async function readHandle() {
  const database = await db();
  return new Promise((resolve) => {
    const tx = database.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
    request.onsuccess = () => {
      database.close();
      resolve(request.result || null);
    };
    request.onerror = () => {
      database.close();
      resolve(null);
    };
  });
}

export async function deleteHandle() {
  const database = await db();
  return new Promise((resolve) => {
    const tx = database.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => {
      database.close();
      resolve();
    };
    tx.onerror = () => {
      database.close();
      resolve();
    };
    tx.onabort = () => {
      database.close();
      resolve();
    };
  });
}
