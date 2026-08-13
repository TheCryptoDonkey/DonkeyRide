import { bytesToHex } from './nostr';

/**
 * An unpublished, memory-only identity for one provider online shift.
 *
 * Public availability events need a stable author long enough for riders to
 * replace the previous beacon rather than count one provider repeatedly. They
 * do not need the provider's account/reputation identity. A new shift gets a
 * new random author and going offline drops the only copy of its secret.
 */
export class EphemeralShiftIdentity {
  private privKeyHex: string | null = null;
  private pending: Promise<string> | null = null;
  private generation = 0;

  async privateKey(): Promise<string> {
    if (this.privKeyHex) return this.privKeyHex;
    if (this.pending) return this.pending;
    const generation = this.generation;
    this.pending = import('nostr-tools').then(({ generateSecretKey }) => {
      const bytes = generateSecretKey();
      try {
        const key = bytesToHex(bytes);
        if (generation === this.generation) this.privKeyHex = key;
        return key;
      } finally {
        bytes.fill(0);
        if (generation === this.generation) this.pending = null;
      }
    });
    return this.pending;
  }

  clear(): void {
    this.generation += 1;
    this.privKeyHex = null;
    this.pending = null;
  }
}
