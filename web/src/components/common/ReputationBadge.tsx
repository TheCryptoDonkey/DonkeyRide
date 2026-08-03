import { useEffect, useState } from 'react';
import { fetchReputation } from '../../services/reputation';
import type { Reputation } from '../../types/api';

// Session cache — a lookup costs a relay round trip and reputation is
// stable within a ride, so never fetch the same subject twice
const cache = new Map<string, Reputation | null>();

/**
 * Compact reputation line for a counterparty. Trust-minimised: the
 * ratings are read from public relays and signature-verified in THIS
 * client (operator only as fallback) — never an invented number, and not
 * a number any operator could fake. Honestly says "No ratings yet" for a
 * fresh keypair, and surfaces any emergency signals the keypair raised.
 */
export function ReputationBadge({ subject }: { subject?: string | null }) {
  const [rep, setRep] = useState<Reputation | null | undefined>(
    subject ? cache.get(subject) : undefined,
  );

  useEffect(() => {
    if (!subject) return;
    if (cache.has(subject)) {
      setRep(cache.get(subject));
      return;
    }
    let stale = false;
    fetchReputation(subject)
      .then((profile) => {
        cache.set(subject, profile);
        if (!stale) setRep(profile);
      })
      .catch(() => {
        cache.set(subject, null);
        if (!stale) setRep(null);
      });
    return () => { stale = true; };
  }, [subject]);

  // Loading or lookup failed — show nothing rather than a made-up figure
  if (!subject || rep === undefined || rep === null) return null;

  const noShows = rep.noShowCount ?? 0;

  if (rep.ratingsCount === 0 && noShows === 0) {
    return <p className="text-xs text-donkey-muted">No ratings yet</p>;
  }

  return (
    <p className="text-xs text-donkey-text">
      <span className="text-donkey-orange">★</span>{' '}
      <span className="font-bold">{rep.averageRating.toFixed(1)}</span>
      <span className="text-donkey-muted">
        {' '}· {rep.ratingsCount} rating{rep.ratingsCount === 1 ? '' : 's'}
      </span>
      {noShows > 0 && (
        <span className="text-donkey-orange">
          {' '}· ⚠ {noShows} no-show report{noShows === 1 ? '' : 's'}
        </span>
      )}
      {rep.panicCount > 0 && (
        <span className="text-donkey-red">
          {' '}· ⚠ {rep.panicCount} emergency signal{rep.panicCount === 1 ? '' : 's'}
        </span>
      )}
    </p>
  );
}
