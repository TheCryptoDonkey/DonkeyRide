/**
 * Minimal Nostr Wallet Connect (NIP-47) client.
 *
 * Lets the rider pay a bolt11 invoice from their own connected Lightning
 * wallet, entirely peer-to-peer: the request is encrypted to the wallet
 * service and the wallet pays the invoice directly. DonkeyRide never sees or
 * holds the funds — it only hands the invoice to the rider's wallet and reads
 * back the preimage as proof.
 *
 * Encryption is NIP-44 by default (preferred), falling back to NIP-04 when the
 * wallet's info event advertises only legacy encryption. We never send the
 * same pay request twice, so there is no double-payment hazard.
 */
import type { NostrEvent } from '../types/nostr';
import { hexToBytes } from './nostr';

/** kinds per NIP-47 */
const KIND_INFO = 13194;
const KIND_REQUEST = 23194;
const KIND_RESPONSE = 23195;

const NWC_STORAGE_KEY = 'donkeyride.nwc';

export interface NwcConnection {
  /** Wallet service pubkey (hex) */
  walletPubkey: string;
  /** Relay the wallet listens on */
  relay: string;
  /** Client secret key (hex) — signs requests and derives the shared secret */
  secret: string;
}

export type NwcEncryption = 'nip44' | 'nip04';

/** Read the stored NWC connection URI, if the user has connected a wallet */
export function getStoredNwcUri(): string | null {
  try {
    return localStorage.getItem(NWC_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Persist (or clear) the NWC connection URI */
export function setStoredNwcUri(uri: string | null): void {
  try {
    if (uri) localStorage.setItem(NWC_STORAGE_KEY, uri);
    else localStorage.removeItem(NWC_STORAGE_KEY);
  } catch {
    // Storage unavailable — the URI just won't be remembered
  }
}

/**
 * Parse a `nostr+walletconnect://<pubkey>?relay=<url>&secret=<hex>` URI.
 * Throws on anything malformed so the UI can show a clear error.
 */
export function parseNwcUri(uri: string): NwcConnection {
  const trimmed = (uri || '').trim();
  if (!/^nostr\+walletconnect:\/\//i.test(trimmed)) {
    throw new Error('Expected a nostr+walletconnect:// connection string');
  }
  // The pubkey sits where the host would be; normalise so URL() parses it.
  const url = new URL(trimmed.replace(/^nostr\+walletconnect:\/\//i, 'https://'));
  const walletPubkey = (url.hostname || url.pathname.replace(/^\/+/, '')).toLowerCase();
  const relay = url.searchParams.get('relay') || '';
  const secret = (url.searchParams.get('secret') || '').toLowerCase();

  if (!/^[0-9a-f]{64}$/.test(walletPubkey)) {
    throw new Error('Connection string is missing a valid wallet pubkey');
  }
  if (!relay) {
    throw new Error('Connection string is missing a relay');
  }
  if (!/^[0-9a-f]{64}$/.test(secret)) {
    throw new Error('Connection string is missing a valid secret');
  }
  return { walletPubkey, relay, secret };
}

async function encryptContent(
  conn: NwcConnection,
  plaintext: string,
  encryption: NwcEncryption,
): Promise<string> {
  const { nip44, nip04 } = await import('nostr-tools');
  if (encryption === 'nip44') {
    const key = nip44.getConversationKey(hexToBytes(conn.secret), conn.walletPubkey);
    return nip44.v2.encrypt(plaintext, key);
  }
  return nip04.encrypt(conn.secret, conn.walletPubkey, plaintext);
}

/** Decrypt content from the wallet, auto-detecting NIP-44 vs NIP-04 payloads */
export async function decryptContent(
  conn: NwcConnection,
  content: string,
): Promise<string> {
  const { nip44, nip04 } = await import('nostr-tools');
  // NIP-04 ciphertext carries a `?iv=` marker; NIP-44 is a single base64 blob.
  if (content.includes('?iv=')) {
    return nip04.decrypt(conn.secret, conn.walletPubkey, content);
  }
  const key = nip44.getConversationKey(hexToBytes(conn.secret), conn.walletPubkey);
  return nip44.v2.decrypt(content, key);
}

/**
 * Build (and sign) a NIP-47 `pay_invoice` request event (kind 23194).
 * The content is the encrypted JSON `{method:'pay_invoice',params:{invoice}}`
 * and the event is p-tagged to the wallet service pubkey.
 */
export async function buildNwcRequestEvent(
  conn: NwcConnection,
  invoice: string,
  encryption: NwcEncryption = 'nip44',
): Promise<NostrEvent> {
  const { finalizeEvent } = await import('nostr-tools');
  const payload = JSON.stringify({ method: 'pay_invoice', params: { invoice } });
  const content = await encryptContent(conn, payload, encryption);
  const tags: string[][] = [['p', conn.walletPubkey]];
  if (encryption === 'nip44') tags.push(['encryption', 'nip44_v2']);
  const template = {
    kind: KIND_REQUEST,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
  };
  return finalizeEvent(template, hexToBytes(conn.secret)) as unknown as NostrEvent;
}

/**
 * Discover which encryption the wallet supports from its info event (13194).
 * Prefers NIP-44; returns 'nip04' only when the wallet advertises legacy-only.
 * On any uncertainty defaults to NIP-44 (the modern norm).
 */
async function pickEncryption(
  pool: import('nostr-tools').SimplePool,
  conn: NwcConnection,
): Promise<NwcEncryption> {
  try {
    const info = await pool.get(
      [conn.relay],
      { kinds: [KIND_INFO], authors: [conn.walletPubkey] },
      { maxWait: 3000 },
    );
    if (!info) return 'nip44';
    const encTag = info.tags.find((t) => t[0] === 'encryption');
    if (encTag) {
      const schemes = encTag.slice(1).join(' ').toLowerCase();
      if (schemes.includes('nip44')) return 'nip44';
      if (schemes.includes('nip04')) return 'nip04';
    }
    return 'nip44';
  } catch {
    return 'nip44';
  }
}

export interface NwcPayResult {
  preimage: string;
}

/**
 * Raised when the payment's outcome is genuinely UNKNOWN.
 *
 * Once the request has been published to the relay, the wallet may have paid.
 * A timeout, an unreadable response, or a "success" carrying no usable
 * preimage all mean we cannot say either way — and telling the payer it
 * failed invites them to pay a second time. Only failures raised BEFORE
 * publication (a malformed connection string, an encryption failure) prove
 * nothing was attempted; those stay ordinary Errors.
 */
export class NwcUnknownOutcomeError extends Error {
  readonly ambiguous = true;

  constructor(message: string) {
    super(message);
    this.name = 'NwcUnknownOutcomeError';
  }
}

/** Whether an error from payInvoiceViaNwc left the payment outcome unknown */
export function isUnknownOutcome(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { ambiguous?: boolean }).ambiguous === true;
}

/**
 * NIP-47 error codes that genuinely mean the payment was not attempted, or was
 * abandoned before any HTLC left the wallet. Everything else — INTERNAL, OTHER,
 * anything unrecognised — is an unknown outcome, because a wallet that started
 * paying and then failed to report reports it the same way.
 */
const DEFINITE_FAILURE_CODES = new Set([
  'PAYMENT_FAILED',
  'INSUFFICIENT_BALANCE',
  'QUOTA_EXCEEDED',
  'UNAUTHORIZED',
  'RESTRICTED',
  'NOT_IMPLEMENTED',
  'RATE_LIMITED',
]);

/**
 * Pay a bolt11 invoice via the connected wallet. Resolves with the preimage
 * (proof of payment) or rejects with the wallet's error / a timeout.
 */
export async function payInvoiceViaNwc(
  uri: string,
  invoice: string,
  opts: { timeoutMs?: number } = {},
): Promise<NwcPayResult> {
  const conn = parseNwcUri(uri);
  const timeoutMs = opts.timeoutMs ?? 60000;
  const { SimplePool, getPublicKey } = await import('nostr-tools');
  const pool = new SimplePool();
  const clientPubkey = getPublicKey(hexToBytes(conn.secret));

  try {
    const encryption = await pickEncryption(pool, conn);
    const requestEvent = await buildNwcRequestEvent(conn, invoice, encryption);

    return await new Promise<NwcPayResult>((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { sub.close(); } catch { /* already closed */ }
        fn();
      };

      // The request is already on the relay by the time this fires, so the
      // wallet may well have paid. Unknown, never "failed".
      const timer = setTimeout(
        () => finish(() => reject(new NwcUnknownOutcomeError('Wallet did not respond in time'))),
        timeoutMs,
      );

      const sub = pool.subscribeMany(
        [conn.relay],
        {
          kinds: [KIND_RESPONSE],
          authors: [conn.walletPubkey],
          '#e': [requestEvent.id],
          '#p': [clientPubkey],
        },
        {
          async onevent(event) {
            try {
              const decrypted = await decryptContent(conn, event.content);
              const parsed = JSON.parse(decrypted);
              if (parsed.error) {
                const message = parsed.error.message || parsed.error.code
                  || 'Wallet rejected the payment';
                // Only some NIP-47 errors mean "definitely not paid". INTERNAL
                // and OTHER are as ambiguous as a timeout: a wallet that
                // launched the HTLC and then failed to report lands here, and
                // calling that a failure invites a second payment. Anything
                // unrecognised is treated the same way, since a code we do not
                // know is a code we cannot rule out.
                finish(() => reject(
                  DEFINITE_FAILURE_CODES.has(String(parsed.error.code || '').toUpperCase())
                    ? new Error(message)
                    : new NwcUnknownOutcomeError(message),
                ));
                return;
              }
              // A preimage is 32 bytes of hex or it is not a preimage. A
              // wallet answering "success" with anything else has told us
              // nothing we can act on — notably a bridge whose node could not
              // route, which reports the failure as a 200 with an empty
              // preimage. That is an unknown outcome, not a failure.
              const preimage = parsed.result?.preimage;
              if (typeof preimage === 'string' && /^[0-9a-f]{64}$/i.test(preimage)) {
                finish(() => resolve({ preimage: preimage.toLowerCase() }));
              } else {
                finish(() => reject(new NwcUnknownOutcomeError(
                  'Wallet reported success without a usable payment proof',
                )));
              }
            } catch (err) {
              // Decrypt or parse failure, after publication: also unknown.
              finish(() => reject(new NwcUnknownOutcomeError(
                err instanceof Error ? err.message : 'Failed to read wallet response',
              )));
            }
          },
        },
      );

      // Publish after the subscription is open so a fast response is not missed.
      pool.publish([conn.relay], requestEvent as unknown as Parameters<typeof pool.publish>[1]);
    });
  } finally {
    try { pool.close([conn.relay]); } catch { /* noop */ }
  }
}
