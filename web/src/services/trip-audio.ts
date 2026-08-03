/**
 * Trip audio recording — device-local, encrypted at rest, operator-blind.
 *
 * The recording never leaves the phone: no upload, no operator storage,
 * nothing on relays. Audio is encrypted with a key derived from the user's
 * OWN account key + task id, so a copied browser profile or synced backup
 * cannot play it without the nsec, and expires automatically after 72 hours
 * unless exported.
 *
 * Consent posture: recording-consent law varies by jurisdiction (one-party
 * vs all-party). The UI therefore (a) tells the recorder the law varies and
 * (b) automatically notifies the counterparty over the E2E chat when
 * recording starts — so every trip recording is all-party-informed.
 */

export interface TripRecordingMeta {
  taskId: string;
  createdAt: number;
  durationMs: number;
  bytes: number;
  mimeType: string;
}

interface StoredRecording extends TripRecordingMeta {
  iv: number[];
  cipher: ArrayBuffer;
}

export const RETENTION_MS = 72 * 3600 * 1000;

const DB_NAME = 'donkeyride-trip-audio';
const STORE = 'recordings';

// In-memory fallback when IndexedDB is unavailable (tests, private
// browsing modes) — same semantics, no persistence across reloads.
const memoryStore = new Map<string, StoredRecording>();

function idbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'taskId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(record: StoredRecording): Promise<void> {
  if (!idbAvailable()) {
    memoryStore.set(record.taskId, record);
    return;
  }
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function idbGet(taskId: string): Promise<StoredRecording | null> {
  if (!idbAvailable()) {
    return memoryStore.get(taskId) ?? null;
  }
  const db = await openDb();
  const result = await new Promise<StoredRecording | null>((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(taskId);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

async function idbAll(): Promise<StoredRecording[]> {
  if (!idbAvailable()) {
    return Array.from(memoryStore.values());
  }
  const db = await openDb();
  const result = await new Promise<StoredRecording[]>((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

export async function deleteRecording(taskId: string): Promise<void> {
  if (!idbAvailable()) {
    memoryStore.delete(taskId);
    return;
  }
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(taskId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** Drop everything past retention. Returns what remains, newest first. */
export async function listRecordings(now = Date.now()): Promise<TripRecordingMeta[]> {
  const all = await idbAll();
  const kept: TripRecordingMeta[] = [];
  for (const rec of all) {
    if (now - rec.createdAt > RETENTION_MS) {
      await deleteRecording(rec.taskId);
    } else {
      kept.push({
        taskId: rec.taskId,
        createdAt: rec.createdAt,
        durationMs: rec.durationMs,
        bytes: rec.bytes,
        mimeType: rec.mimeType,
      });
    }
  }
  return kept.sort((a, b) => b.createdAt - a.createdAt);
}

// ── Encryption ──────────────────────────────────────

async function deriveKey(privKeyHex: string, taskId: string): Promise<CryptoKey> {
  const material = new TextEncoder().encode(`${privKeyHex}:${taskId}:trip-audio`);
  const digest = await crypto.subtle.digest('SHA-256', material);
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/**
 * Copy a buffer into a freshly-allocated typed-array view before it
 * reaches WebCrypto. Node 20's WebIDL converter (vitest/jsdom on CI)
 * rejects buffers whose constructor crossed a realm boundary (e.g. from
 * a sandboxed FileReader); a fresh same-realm view always passes, in
 * browsers and in Node.
 */
function toRealmBytes(buf: ArrayBuffer): BufferSource {
  const src = new Uint8Array(buf);
  const copy = new Uint8Array(src.length);
  copy.set(src);
  return copy;
}

export async function encryptAudio(
  privKeyHex: string,
  taskId: string,
  plain: ArrayBuffer,
): Promise<{ iv: number[]; cipher: ArrayBuffer }> {
  const key = await deriveKey(privKeyHex, taskId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, toRealmBytes(plain));
  return { iv: Array.from(iv), cipher };
}

export async function decryptAudio(
  privKeyHex: string,
  taskId: string,
  iv: number[],
  cipher: ArrayBuffer,
): Promise<ArrayBuffer> {
  const key = await deriveKey(privKeyHex, taskId);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, key, toRealmBytes(cipher));
}

/** Blob.arrayBuffer with a FileReader fallback (older WebViews, jsdom) */
export function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/** Encrypt and store a finished recording. */
export async function saveRecording(
  privKeyHex: string,
  taskId: string,
  audio: Blob,
  durationMs: number,
): Promise<TripRecordingMeta> {
  const plain = await blobToArrayBuffer(audio);
  const { iv, cipher } = await encryptAudio(privKeyHex, taskId, plain);
  const record: StoredRecording = {
    taskId,
    createdAt: Date.now(),
    durationMs,
    bytes: plain.byteLength,
    mimeType: audio.type || 'audio/webm',
    iv,
    cipher,
  };
  await idbPut(record);
  return record;
}

/** Decrypt a stored recording back to a playable Blob (for export). */
export async function exportRecording(
  privKeyHex: string,
  taskId: string,
): Promise<{ blob: Blob; meta: TripRecordingMeta } | null> {
  const rec = await idbGet(taskId);
  if (!rec) return null;
  const plain = await decryptAudio(privKeyHex, taskId, rec.iv, rec.cipher);
  return {
    blob: new Blob([plain], { type: rec.mimeType }),
    meta: {
      taskId: rec.taskId,
      createdAt: rec.createdAt,
      durationMs: rec.durationMs,
      bytes: rec.bytes,
      mimeType: rec.mimeType,
    },
  };
}

// ── Recording session ───────────────────────────────

export interface TripRecorder {
  /** Stop, encrypt and store; resolves with the stored metadata */
  stop(): Promise<TripRecordingMeta | null>;
  isRecording(): boolean;
}

/**
 * Start recording the trip. Caller is responsible for the consent flow
 * (notice + counterparty chat notification) BEFORE calling this.
 */
export async function startTripRecording(
  privKeyHex: string,
  taskId: string,
): Promise<TripRecorder> {
  if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Audio recording is not supported on this device');
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const chunks: BlobPart[] = [];
  const startedAt = Date.now();
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  recorder.start(10_000); // periodic chunks so a crash loses little

  let stopped = false;
  return {
    isRecording: () => !stopped,
    stop: () =>
      new Promise((resolve) => {
        if (stopped) {
          resolve(null);
          return;
        }
        stopped = true;
        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          try {
            const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
            resolve(await saveRecording(privKeyHex, taskId, blob, Date.now() - startedAt));
          } catch {
            resolve(null);
          }
        };
        recorder.stop();
      }),
  };
}
