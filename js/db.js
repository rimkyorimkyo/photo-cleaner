/**
 * Photo Cleaner IndexedDB Storage
 * Stores photos and folder metadata locally on user's device.
 */

const DB_NAME = 'PhotoCleanerDB';
const DB_VERSION = 1;

let dbInstance = null;

export const DEFAULT_FOLDERS = [];

export async function openDB() {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Photos Object Store
      if (!db.objectStoreNames.contains('photos')) {
        const photoStore = db.createObjectStore('photos', { keyPath: 'id' });
        photoStore.createIndex('folderId', 'folderId', { unique: false });
        photoStore.createIndex('isTrash', 'isTrash', { unique: false });
        photoStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Folders Object Store
      if (!db.objectStoreNames.contains('folders')) {
        const folderStore = db.createObjectStore('folders', { keyPath: 'id' });
        folderStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = async (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('IndexedDB Open Error:', event.target.error);
      reject(event.target.error);
    };
  });
}

// ----------------- FOLDERS -----------------
export async function getAllFolders() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('folders', 'readonly');
    const store = tx.objectStore('folders');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function addFolder(folder) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('folders', 'readwrite');
    const store = tx.objectStore('folders');
    const request = store.put(folder);
    request.onsuccess = () => resolve(folder);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteFolder(folderId) {
  const db = await openDB();
  // Move all photos in this folder to unassigned ('')
  const photos = await getPhotosByFolder(folderId);
  for (const photo of photos) {
    photo.folderId = '';
    await updatePhoto(photo);
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction('folders', 'readwrite');
    const store = tx.objectStore('folders');
    const request = store.delete(folderId);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

// ----------------- PHOTOS -----------------
export async function addPhotos(photos) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readwrite');
    const store = tx.objectStore('photos');

    for (const photo of photos) {
      store.put(photo);
    }

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllPhotos() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readonly');
    const store = tx.objectStore('photos');
    const request = store.getAll();
    request.onsuccess = () => {
      const photos = (request.result || []).sort((a, b) => b.createdAt - a.createdAt);
      resolve(photos);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getPhotosByFolder(folderId) {
  const all = await getAllPhotos();
  return all.filter(p => !p.isTrash && p.folderId === folderId);
}

export async function updatePhoto(photo) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readwrite');
    const store = tx.objectStore('photos');
    const request = store.put(photo);
    request.onsuccess = () => resolve(photo);
    request.onerror = () => reject(request.error);
  });
}

export async function batchMovePhotos(photoIds, targetFolderId) {
  const db = await openDB();
  const tx = db.transaction('photos', 'readwrite');
  const store = tx.objectStore('photos');

  for (const id of photoIds) {
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const photo = getReq.result;
      if (photo) {
        photo.folderId = targetFolderId;
        photo.isTrash = false;
        store.put(photo);
      }
    };
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function batchTrashPhotos(photoIds, isTrash = true) {
  const db = await openDB();
  const tx = db.transaction('photos', 'readwrite');
  const store = tx.objectStore('photos');

  for (const id of photoIds) {
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const photo = getReq.result;
      if (photo) {
        photo.isTrash = isTrash;
        store.put(photo);
      }
    };
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function batchPermanentDelete(photoIds) {
  const db = await openDB();
  const tx = db.transaction('photos', 'readwrite');
  const store = tx.objectStore('photos');

  for (const id of photoIds) {
    store.delete(id);
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearTrash() {
  const all = await getAllPhotos();
  const trashIds = all.filter(p => p.isTrash).map(p => p.id);
  if (trashIds.length > 0) {
    await batchPermanentDelete(trashIds);
  }
  return trashIds.length;
}

// ----------------- STORAGE METRICS -----------------
export async function getStorageStats() {
  const photos = await getAllPhotos();
  let totalBytes = 0;
  let trashBytes = 0;
  let organizedBytes = 0;
  let unorganizedBytes = 0;

  let totalCount = 0;
  let trashCount = 0;
  let organizedCount = 0;
  let unorganizedCount = 0;

  for (const p of photos) {
    const size = p.size || 0;
    if (p.isTrash) {
      trashBytes += size;
      trashCount++;
    } else {
      totalBytes += size;
      totalCount++;
      if (p.folderId) {
        organizedBytes += size;
        organizedCount++;
      } else {
        unorganizedBytes += size;
        unorganizedCount++;
      }
    }
  }

  return {
    totalBytes,
    trashBytes,
    organizedBytes,
    unorganizedBytes,
    totalCount,
    trashCount,
    organizedCount,
    unorganizedCount,
  };
}
