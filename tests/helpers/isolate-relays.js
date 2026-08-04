/**
 * Relay isolation for the integration suite. Require this FIRST, before
 * `require('../../server.js')`.
 *
 * The operator rehydrates non-terminal tasks from its own kind 30078
 * snapshots at boot, so a test that can reach a relay starts with whatever
 * jobs are on it already loaded — a developer's live work, or the residue of
 * the last test run. That is not a hypothetical: it turned a demand-cell
 * assertion from 3 into 12.
 *
 * Clearing NOSTR_RELAY alone is not enough. `server.js` builds its relay list
 * from REPUTATION_RELAYS, then NOSTR_RELAYS, then NOSTR_RELAY, and dotenv has
 * already loaded whatever is in the developer's own .env by the time a test
 * runs. All three have to go, or the suite's isolation depends on which
 * variables that particular developer happens to have set.
 *
 * Tests that genuinely want a relay should pin one explicitly AFTER requiring
 * this (see tests/live/), so the intent is visible in the file.
 */

process.env.NOSTR_RELAY = '';
process.env.NOSTR_RELAYS = '';
process.env.REPUTATION_RELAYS = '';
process.env.PUBLIC_RELAY_URLS = '';

module.exports = {};
