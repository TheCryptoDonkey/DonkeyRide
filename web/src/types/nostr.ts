/** Nostr identity keys */
export interface NostrIdentity {
  privKeyHex: string;
  pubKeyHex: string;
  npub: string;
}

/** A signed Nostr event */
export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

/** NIP-98 HTTP auth event (kind 27235) */
export interface Nip98AuthEvent extends NostrEvent {
  kind: 27235;
}
