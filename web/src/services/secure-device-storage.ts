const DB_NAME = 'donkeyride-secure-device';
const STORE_NAME = 'keys';
const DEVICE_KEY_ID = 'local-aes-gcm-v1';
const ENVELOPE_PREFIX = 'donkeyride.secure.';

interface Envelope {
  v: 1;
  iv: string;
  cipher: string;
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function unbase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Secure storage request failed'));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB || !globalThis.crypto?.subtle) {
    return Promise.reject(new Error('Secure device storage is unavailable in this browser'));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Secure storage could not be opened'));
  });
}

async function readDeviceKey(database: IDBDatabase): Promise<CryptoKey | null> {
  const transaction = database.transaction(STORE_NAME, 'readonly');
  return (await requestResult(transaction.objectStore(STORE_NAME).get(DEVICE_KEY_ID))) || null;
}

async function writeDeviceKey(database: IDBDatabase, key: CryptoKey): Promise<void> {
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  await requestResult(transaction.objectStore(STORE_NAME).put(key, DEVICE_KEY_ID));
}

let deviceKeyPromise: Promise<CryptoKey> | null = null;

async function deviceKey(): Promise<CryptoKey> {
  if (!deviceKeyPromise) {
    deviceKeyPromise = (async () => {
      const database = await openDatabase();
      try {
        const stored = await readDeviceKey(database);
        if (stored) return stored;
        const created = await crypto.subtle.generateKey(
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt'],
        );
        await writeDeviceKey(database, created);
        return created;
      } finally {
        database.close();
      }
    })().catch((error) => {
      deviceKeyPromise = null;
      throw error;
    });
  }
  return deviceKeyPromise;
}

/** Encrypt a small secret under this installed PWA origin's device key. */
export async function secureDeviceSet(name: string, plaintext: string): Promise<void> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await deviceKey(),
    new TextEncoder().encode(plaintext),
  );
  const envelope: Envelope = {
    v: 1,
    iv: base64(iv),
    cipher: base64(new Uint8Array(cipher)),
  };
  localStorage.setItem(ENVELOPE_PREFIX + name, JSON.stringify(envelope));
}

/** Read and authenticate a secret. Returns null only when none was stored. */
export async function secureDeviceGet(name: string): Promise<string | null> {
  const stored = localStorage.getItem(ENVELOPE_PREFIX + name);
  if (!stored) return null;
  const envelope = JSON.parse(stored) as Envelope;
  if (envelope.v !== 1 || typeof envelope.iv !== 'string' || typeof envelope.cipher !== 'string') {
    throw new Error('Secure device record is malformed');
  }
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unbase64(envelope.iv) },
    await deviceKey(),
    unbase64(envelope.cipher),
  );
  return new TextDecoder().decode(plain);
}

export function secureDeviceEnvelope(name: string): string | null {
  return localStorage.getItem(ENVELOPE_PREFIX + name);
}

/** Remove one encrypted record without touching the non-exportable device key. */
export function secureDeviceRemove(name: string): void {
  localStorage.removeItem(ENVELOPE_PREFIX + name);
}
