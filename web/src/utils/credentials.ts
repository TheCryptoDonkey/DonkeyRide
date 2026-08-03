/**
 * What a provider says they hold: private hire licence, hire-and-reward
 * insurance, an SIA badge, goods-in-transit cover.
 *
 * Device-local, exactly like the vehicle and the access features. Sent on
 * accept, where it becomes participant-gated task state — never broadcast
 * pre-accept, never in the Nostr snapshot. Self-attested throughout: the
 * operator records the claim and shows it, it does not verify it, and no
 * screen in this app says "verified".
 *
 * Expiry is part of the claim. A licence that ran out in March is not a
 * licence, so an expired entry is never sent and is shown to its own owner
 * as the problem it is.
 */

const STORAGE_KEY = 'donkeyride.credentials';

export interface Credential {
  id: string;
  /** Unix ms. Absent means "no expiry given", which is weaker, not stronger */
  expiresAt?: number;
  /** Licence or policy number — participant-gated, capped */
  reference?: string;
}

/** How close to expiry counts as "renew this now" */
export const EXPIRY_WARNING_MS = 30 * 24 * 3600 * 1000;

function clean(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, max)
    : undefined;
}

export function loadCredentials(): Credential[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: Credential[] = [];
    const seen = new Set<string>();
    for (const entry of parsed) {
      const id = clean(entry?.id, 40)?.toLowerCase();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const expiresAt = Number(entry?.expiresAt);
      out.push({
        id,
        ...(Number.isFinite(expiresAt) && expiresAt > 0 ? { expiresAt } : {}),
        ...(clean(entry?.reference, 60) ? { reference: clean(entry.reference, 60) } : {}),
      });
    }
    return out;
  } catch {
    return [];
  }
}

export function saveCredentials(credentials: Credential[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
  } catch {
    // Storage unavailable — the declaration just will not persist
  }
}

/** Has this claim already run out? */
export function isExpired(credential: Credential, now = Date.now()): boolean {
  return credential.expiresAt != null && credential.expiresAt <= now;
}

/** Running out soon enough that it needs renewing before the next shift */
export function isExpiringSoon(credential: Credential, now = Date.now()): boolean {
  return credential.expiresAt != null
    && credential.expiresAt > now
    && credential.expiresAt - now <= EXPIRY_WARNING_MS;
}

/**
 * The claims worth sending: expired ones are dropped here as well as
 * operator-side, so a driver is never quietly presented as licensed on the
 * strength of a certificate that lapsed last year.
 */
export function validCredentials(now = Date.now()): Credential[] {
  return loadCredentials().filter((c) => !isExpired(c, now));
}

/**
 * Required ids this provider has not covered with a live claim. Drives the
 * dashboard notice — an operator with ENFORCE_CREDENTIALS on will refuse
 * the accept, and finding that out at the kerb is too late.
 */
export function missingRequired(
  required: { id: string; required?: boolean }[],
  held: Credential[] = validCredentials(),
): string[] {
  const ids = new Set(held.map((c) => c.id));
  return required.filter((c) => c.required).map((c) => c.id).filter((id) => !ids.has(id));
}
