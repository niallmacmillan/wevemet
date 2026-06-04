/* =====================================================================
 * Media store — IndexedDB-backed blob storage for attendee photos and
 * videos.
 *
 * Images and (especially) videos are far too large for localStorage's
 * ~5MB quota, so the binary blobs live in IndexedDB keyed by id. The
 * person record in localStorage only keeps lightweight references
 * ({ id, kind, name }); the actual bytes are fetched on demand here.
 * ===================================================================== */

const DB_NAME = 'wevemet';
const STORE = 'media';
let dbPromise = null;

function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function store(mode) {
  const d = await db();
  return d.transaction(STORE, mode).objectStore(STORE);
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** Save a blob and return its generated id. */
export async function putMedia(blob, id = uid()) {
  const s = await store('readwrite');
  return new Promise((resolve, reject) => {
    const r = s.put(blob, id);
    r.onsuccess = () => resolve(id);
    r.onerror = () => reject(r.error);
  });
}

/** Fetch a blob by id (or null if missing). */
export async function getMedia(id) {
  const s = await store('readonly');
  return new Promise((resolve, reject) => {
    const r = s.get(id);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  });
}

/** Fetch a blob and wrap it in an object URL ready for an <img>/<video>. */
export async function getMediaURL(id) {
  const blob = await getMedia(id);
  return blob ? URL.createObjectURL(blob) : null;
}

export async function deleteMedia(id) {
  const s = await store('readwrite');
  return new Promise((resolve) => {
    const r = s.delete(id);
    r.onsuccess = r.onerror = () => resolve();
  });
}
