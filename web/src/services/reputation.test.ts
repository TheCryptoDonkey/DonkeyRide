import { describe, it, expect } from 'vitest';
import { generateSecretKey, getPublicKey, finalizeEvent, verifyEvent, nip19 } from 'nostr-tools';
import { aggregateReputation, filterVerified, resolveHex } from './reputation';
import type { NostrEvent } from '../types/nostr';

const TASK_RATING = 30520;
const EMERGENCY_SIGNAL = 30540;

function makeIdentity() {
  const priv = generateSecretKey();
  return { priv, pub: getPublicKey(priv) };
}

function signedRating(
  rater: { priv: Uint8Array },
  subjectHex: string,
  rating: number,
  rideId: string,
  createdAt = Math.floor(Date.now() / 1000),
): NostrEvent {
  return finalizeEvent({
    kind: TASK_RATING,
    created_at: createdAt,
    tags: [['p', subjectHex], ['rating', String(rating)], ['ride', rideId]],
    content: '',
  }, rater.priv) as NostrEvent;
}

describe('client-side reputation', () => {
  const subject = makeIdentity();
  const subjectNpub = nip19.npubEncode(subject.pub);
  const verify = (event: NostrEvent) => verifyEvent(event as never);

  it('aggregates verified ratings into an honest average', () => {
    const a = makeIdentity();
    const b = makeIdentity();
    const events = [
      signedRating(a, subject.pub, 5, 'ride-1'),
      signedRating(b, subject.pub, 4, 'ride-2'),
    ];
    const rep = aggregateReputation(subject.pub, subjectNpub, events, []);
    expect(rep.averageRating).toBe(4.5);
    expect(rep.ratingsCount).toBe(2);
    expect(rep.distinctRaters).toBe(2);
    expect(rep.panicCount).toBe(0);
  });

  it('dedupes to one rating per (rater, ride), newest wins — no stuffing', () => {
    const rater = makeIdentity();
    const now = Math.floor(Date.now() / 1000);
    const events = [
      signedRating(rater, subject.pub, 1, 'ride-1', now - 60),
      signedRating(rater, subject.pub, 1, 'ride-1', now - 30),
      signedRating(rater, subject.pub, 5, 'ride-1', now), // newest wins
    ];
    const rep = aggregateReputation(subject.pub, subjectNpub, events, []);
    expect(rep.ratingsCount).toBe(1);
    expect(rep.averageRating).toBe(5);
  });

  it('rejects events with forged signatures', () => {
    const rater = makeIdentity();
    // JSON round-trip strips nostr-tools' verified-symbol stamp, matching
    // how events really arrive from a relay (plain parsed JSON)
    const asWireEvent = (event: NostrEvent): NostrEvent => JSON.parse(JSON.stringify(event));
    const good = asWireEvent(signedRating(rater, subject.pub, 5, 'ride-1'));
    const forged = {
      ...asWireEvent(signedRating(rater, subject.pub, 1, 'ride-2')),
      sig: '00'.repeat(64),
    };
    const verified = filterVerified([good, forged], verify);
    expect(verified).toHaveLength(1);
    expect(verified[0].id).toBe(good.id);
  });

  it('counts only the subject\'s own emergency signals', () => {
    const other = makeIdentity();
    const ownPanic = finalizeEvent({
      kind: EMERGENCY_SIGNAL,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: '',
    }, subject.priv) as NostrEvent;
    const someoneElses = finalizeEvent({
      kind: EMERGENCY_SIGNAL,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: '',
    }, other.priv) as NostrEvent;
    const rep = aggregateReputation(subject.pub, subjectNpub, [], [ownPanic, someoneElses]);
    expect(rep.panicCount).toBe(1);
  });

  it('resolves npub and hex subjects, rejects garbage', async () => {
    expect(await resolveHex(subject.pub.toUpperCase())).toBe(subject.pub.toLowerCase());
    expect(await resolveHex(subjectNpub)).toBe(subject.pub.toLowerCase());
    expect(await resolveHex('not-a-key')).toBeNull();
  });
});
