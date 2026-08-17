import { describe, it, expect } from 'vitest';
import { generateSecretKey, getPublicKey, nip44, nip04 } from 'nostr-tools';
import {
  parseNwcUri, buildNwcRequestEvent, decryptContent,
  NwcUnknownOutcomeError, isUnknownOutcome, walletErrorToThrowable,
} from './nwc';
import { bytesToHex } from './nostr';

const INVOICE = 'lnbc10n1pjabcdefgtestinvoice';

function makeConnectionUri() {
  const clientSecret = bytesToHex(generateSecretKey());
  const walletSecret = generateSecretKey();
  const walletPubkey = getPublicKey(walletSecret);
  const uri = `nostr+walletconnect://${walletPubkey}?relay=wss://relay.example.com&secret=${clientSecret}`;
  return { uri, clientSecret, walletPubkey };
}

describe('parseNwcUri', () => {
  it('parses a valid connection string', () => {
    const { uri, clientSecret, walletPubkey } = makeConnectionUri();
    const conn = parseNwcUri(uri);
    expect(conn.walletPubkey).toBe(walletPubkey);
    expect(conn.secret).toBe(clientSecret);
    expect(conn.relay).toBe('wss://relay.example.com');
  });

  it('rejects non-NWC and malformed strings', () => {
    expect(() => parseNwcUri('https://example.com')).toThrow();
    expect(() => parseNwcUri('nostr+walletconnect://xyz?relay=wss://r&secret=abc')).toThrow();
  });
});

describe('buildNwcRequestEvent (NIP-44 default)', () => {
  it('builds a kind 23194 event p-tagged to the wallet', async () => {
    const { uri, walletPubkey } = makeConnectionUri();
    const conn = parseNwcUri(uri);
    const event = await buildNwcRequestEvent(conn, INVOICE);

    expect(event.kind).toBe(23194);
    const pTag = event.tags.find((t) => t[0] === 'p');
    expect(pTag?.[1]).toBe(walletPubkey);
    // Advertises NIP-44 encryption
    expect(event.tags.some((t) => t[0] === 'encryption' && t[1] === 'nip44_v2')).toBe(true);
    // Signed by the client key derived from the connection secret
    expect(event.pubkey).toBe(getPublicKey(hexToBytesLocal(conn.secret)));
    expect(event.sig).toMatch(/^[0-9a-f]{128}$/);
  });

  it('encrypts the pay_invoice request so the wallet can decrypt it', async () => {
    const { uri } = makeConnectionUri();
    const conn = parseNwcUri(uri);
    const event = await buildNwcRequestEvent(conn, INVOICE, 'nip44');

    // Decrypt as the wallet would (shared secret is symmetric)
    const key = nip44.getConversationKey(hexToBytesLocal(conn.secret), conn.walletPubkey);
    const decrypted = nip44.v2.decrypt(event.content, key);
    expect(JSON.parse(decrypted)).toEqual({
      method: 'pay_invoice',
      params: { invoice: INVOICE },
    });
  });
});

describe('buildNwcRequestEvent (NIP-04 fallback)', () => {
  it('produces NIP-04 ciphertext (with ?iv=) that decryptContent can read', async () => {
    const { uri } = makeConnectionUri();
    const conn = parseNwcUri(uri);
    const event = await buildNwcRequestEvent(conn, INVOICE, 'nip04');

    expect(event.content).toContain('?iv=');
    const direct = nip04.decrypt(conn.secret, conn.walletPubkey, event.content);
    expect(JSON.parse(direct)).toEqual({ method: 'pay_invoice', params: { invoice: INVOICE } });

    // decryptContent auto-detects the scheme
    const viaHelper = await decryptContent(conn, event.content);
    expect(JSON.parse(viaHelper)).toEqual({ method: 'pay_invoice', params: { invoice: INVOICE } });
  });
});

describe('decryptContent', () => {
  it('round-trips a NIP-44 payload', async () => {
    const { uri } = makeConnectionUri();
    const conn = parseNwcUri(uri);
    const key = nip44.getConversationKey(hexToBytesLocal(conn.secret), conn.walletPubkey);
    const payload = nip44.v2.encrypt(JSON.stringify({ result: { preimage: 'ab'.repeat(32) } }), key);
    const decrypted = await decryptContent(conn, payload);
    expect(JSON.parse(decrypted).result.preimage).toBe('ab'.repeat(32));
  });
});

describe('unknown payment outcomes', () => {
  // Once the request is on the relay the wallet may have paid, so a timeout
  // or an unreadable answer must NOT read as "failed" — that is what leads a
  // payer who did pay to pay again. PayDriver branches on exactly this, and
  // hides its retry button when it is true.
  it('marks an unknown outcome apart from an ordinary failure', () => {
    expect(isUnknownOutcome(new NwcUnknownOutcomeError('Wallet did not respond in time'))).toBe(true);
    // Pre-publication failures prove nothing was attempted, so they are plain
    expect(isUnknownOutcome(new Error('Connection string is missing a relay'))).toBe(false);
    expect(isUnknownOutcome(null)).toBe(false);
    expect(isUnknownOutcome('timeout')).toBe(false);
  });

  it('keeps the message so the payer is told what happened', () => {
    const err = new NwcUnknownOutcomeError('Wallet reported success without a usable payment proof');
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('usable payment proof');
  });

  // A wallet answering with an explicit NIP-47 error is NOT automatically a
  // definite failure. INTERNAL and OTHER are as ambiguous as a timeout: a
  // wallet that launched the HTLC and then failed to report says exactly this.
  // Getting the classification wrong the safe way costs a confusing message;
  // the unsafe way costs a second payment.
  it('treats only the codes that mean "nothing was attempted" as definite', () => {
    for (const code of [
      'PAYMENT_FAILED', 'INSUFFICIENT_BALANCE', 'QUOTA_EXCEEDED',
      'UNAUTHORIZED', 'RESTRICTED', 'NOT_IMPLEMENTED', 'RATE_LIMITED',
    ]) {
      expect(isUnknownOutcome(walletErrorToThrowable(code, 'x')), code).toBe(false);
    }
  });

  it('treats INTERNAL, OTHER and anything unrecognised as unknown', () => {
    for (const code of ['INTERNAL', 'OTHER', 'SOMETHING_NEW', '', null, undefined]) {
      expect(isUnknownOutcome(walletErrorToThrowable(code, 'x')), String(code)).toBe(true);
    }
  });

  it('matches codes case-insensitively, since the wire casing is the wallet\'s choice', () => {
    expect(isUnknownOutcome(walletErrorToThrowable('payment_failed', 'x'))).toBe(false);
    expect(isUnknownOutcome(walletErrorToThrowable('Payment_Failed', 'x'))).toBe(false);
  });

  it('preserves the wallet\'s message either way', () => {
    expect(walletErrorToThrowable('PAYMENT_FAILED', 'no route').message).toBe('no route');
    expect(walletErrorToThrowable('INTERNAL', 'node exploded').message).toBe('node exploded');
  });
});

// Local hex helper so the test does not depend on nwc internals
function hexToBytesLocal(hex: string): Uint8Array {
  const matches = hex.match(/.{1,2}/g) || [];
  return new Uint8Array(matches.map((b) => parseInt(b, 16)));
}
