import { describe, it, expect } from 'vitest';
import {
  encryptAudio, decryptAudio, saveRecording, exportRecording,
  listRecordings, deleteRecording, blobToArrayBuffer, RETENTION_MS,
} from './trip-audio';

// jsdom has no IndexedDB, so the service transparently uses its in-memory
// store here — same code path browsers hit in private-browsing modes.

const PRIV = 'a'.repeat(64);

function audioBlob(text: string): Blob {
  return new Blob([new TextEncoder().encode(text)], { type: 'audio/webm' });
}

describe('trip audio (device-local, encrypted)', () => {
  it('encrypts and decrypts a round trip; wrong key or task cannot decrypt', async () => {
    const plain = new TextEncoder().encode('not actually opus frames').buffer;
    const { iv, cipher } = await encryptAudio(PRIV, 'task-1', plain);
    expect(new Uint8Array(cipher)).not.toEqual(new Uint8Array(plain));

    const back = await decryptAudio(PRIV, 'task-1', iv, cipher);
    expect(new Uint8Array(back)).toEqual(new Uint8Array(plain));

    await expect(decryptAudio('b'.repeat(64), 'task-1', iv, cipher)).rejects.toThrow();
    await expect(decryptAudio(PRIV, 'task-2', iv, cipher)).rejects.toThrow();
  });

  it('stores, exports and deletes a recording', async () => {
    await saveRecording(PRIV, 'task-store', audioBlob('hello trip'), 12_000);

    const exported = await exportRecording(PRIV, 'task-store');
    expect(exported).not.toBeNull();
    const text = new TextDecoder().decode(await blobToArrayBuffer(exported!.blob));
    expect(text).toBe('hello trip');
    expect(exported!.meta.durationMs).toBe(12_000);
    expect(exported!.meta.mimeType).toBe('audio/webm');

    await deleteRecording('task-store');
    expect(await exportRecording(PRIV, 'task-store')).toBeNull();
  });

  it('expires recordings past the 72-hour retention window', async () => {
    await saveRecording(PRIV, 'task-old', audioBlob('old'), 1000);
    await saveRecording(PRIV, 'task-new', audioBlob('new'), 1000);

    const later = Date.now() + RETENTION_MS + 60_000;
    // task-old was saved "now" — pretend time passed beyond retention for
    // both, then confirm a fresh save survives a normal listing
    const expired = await listRecordings(later);
    expect(expired.find((r) => r.taskId === 'task-old')).toBeUndefined();
    expect(expired.find((r) => r.taskId === 'task-new')).toBeUndefined();

    await saveRecording(PRIV, 'task-kept', audioBlob('kept'), 1000);
    const kept = await listRecordings();
    expect(kept.map((r) => r.taskId)).toContain('task-kept');
  });
});
