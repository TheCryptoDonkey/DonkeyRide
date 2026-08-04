/**
 * TROTT protocol event kinds — single source of truth.
 *
 * Aligned with the TROTT specification v0.9 kind table
 * (https://github.com/TheCryptoDonkey/trott/blob/main/specs/QUICK-REFERENCE.md).
 * Every module that publishes or queries Nostr events must import kinds from
 * here rather than hardcoding numbers, so the implementation cannot drift
 * from the spec again.
 */

const KINDS = {
  // NIP-98 HTTP auth
  HTTP_AUTH: 27235,

  // TROTT-02: Discovery
  PROVIDER_AVAILABILITY: 20500,   // ephemeral "I'm available now, here" beacon (provider-signed)
  PROVIDER_PROFILE: 30510,        // provider capabilities/areas (provider-signed)
  OPERATOR_BOND: 30511,           // operator stake, domains, terms, SLA (operator-signed)
  REQUESTER_PROFILE: 30513,       // requester portable profile
  TASK_ANNOUNCEMENT: 37500,       // public bulletin-board announcement (requester-signed, geohash-5 only)

  // TROTT-03: Reputation
  TASK_RATING: 30520,             // either party rates the other (party-signed)
  REPUTATION_QUERY: 30521,
  ACTIVITY_EVIDENCE: 30523,

  // TROTT-04: Payment commitment
  QUOTE: 30530,
  PAYMENT_TERMS: 30531,
  ESCROW_LOCK: 30532,             // funds committed (operator-signed)
  SETTLEMENT: 30533,              // outcome tag: released|forfeited|partial_forfeit|expired (operator-signed)

  // TROTT-04b: Settlement
  PAYMENT_RECEIPT: 30535,         // published on settle-verify / confirm-received
  EARNINGS_SUMMARY: 30538,

  // TROTT-05: Safety
  // Panic (party-signed). Addressable, so it MUST carry a `d` tag of the
  // task id: without one every alert a person raises shares d="" and each
  // new one replaces the last. One event per incident, not one per person.
  EMERGENCY_SIGNAL: 30540,
  SAFETY_CHECKIN: 30541,
  SAFETY_CONTACT_SHARE: 30542,

  // TROTT-05b: Disputes
  DISPUTE_CLAIM: 7543,            // party-signed dispute filing
  DISPUTE_EVIDENCE: 7544,
  DISPUTE_RESOLUTION: 30545,      // operator/mediator-signed; status tag: assigned|resolved

  // TROTT-05c: Abuse
  ABUSE_REPORT: 30546,            // report_type tag distinguishes theft/suspicious-activity/etc.

  // TROTT-06: Operator participation
  OPERATOR_CLAIM: 30550,          // per-task coordination claim
  OPERATOR_HEARTBEAT: 30554,      // liveness, every 5-10 minutes

  // TROTT-01: Lifecycle
  STATE_SNAPSHOT: 30078,          // current task state (custodian-signed)
  STATE_TRANSITION: 7501,

  // NIP-57 tips
  ZAP_RECEIPT: 9735
};

/**
 * DonkeyRide experimental governance extensions. These have NO assigned TROTT
 * kind — they live in a reserved implementation block (39500+, still within
 * the addressable range) so they can never collide with spec-assigned kinds.
 * If the spec later standardises these flows, migrate to the assigned kinds.
 */
const EXPERIMENTAL = {
  WATCHDOG_CLAIM: 39500,
  OPERATOR_SLASHING: 39501,
  ACCOUNT_SUSPENSION: 39502,
  APPEAL_REQUEST: 39503,
  SLASHING_PROPOSAL: 39504,
  GUARDIAN_VOTE: 39505
};

module.exports = { KINDS, EXPERIMENTAL };
