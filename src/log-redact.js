/**
 * Keep people and places out of the operator's logs.
 *
 * The architecture's central privacy claim is that exact PII is in-memory
 * and ephemeral — lost on restart by design. stdout quietly broke that.
 * Docker's json-file driver writes every log line to disk and keeps it
 * (here, 3 x 10 MB) across restarts of the process it came from, so
 * anything printed is durable storage the operator never decided to have,
 * outside the erasure story, and invisible to `/api` privacy controls.
 *
 * The leak that prompted this was not a deliberate log of anything
 * sensitive. It was an ERROR PATH: `console.error('OSRM routing error:',
 * error.message)` where the message is node-fetch's, and node-fetch puts
 * the whole request URL in it —
 *
 *   request to http://localhost:5001/route/v1/driving/
 *     -0.1278,51.5074;-0.0922,51.5155?... failed
 *
 * — which is an exact pickup and an exact dropoff. Adjacent lines carried
 * `Task created: ride_x (npub1...)` under the same ride id, so the log
 * held who, from where, to where and when: the travel history the sealed
 * snapshot exists to keep off a relay, sitting on the operator's disk one
 * layer down. Worst of all it fired precisely when routing was degraded,
 * silently, with nobody watching stdout.
 *
 * So: redact at the point of logging, not at the point of writing the
 * message. Over-redacting a log costs a debugging detail; under-redacting
 * it costs somebody's journey.
 */

// A URL keeps its scheme and host — enough to see WHICH service failed —
// and loses its path and query, which is where user data rides.
const URL_WITH_PATH = /\b([a-z][a-z0-9+.\-]*:\/\/[^/\s?#]+)(?:[/?#]\S*)?/gi;

// A coordinate PAIR at real precision (3+ decimals ≈ 100 m or better).
// Deliberately not single numbers: "1.335km" in a log is useful and
// harmless, "-0.1278,51.5074" is a doorstep.
const COORD_PAIR = /-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/g;

const NPUB = /\bnpub1[023456789acdefghjklmnpqrstuvwxyz]{20,}/gi;
const NSEC = /\bnsec1[023456789acdefghjklmnpqrstuvwxyz]{20,}/gi;
const HEX_KEY = /\b[0-9a-f]{64}\b/gi;

/**
 * Strip identifiers and locations from a string bound for a log.
 * Order matters: URLs go first, so a coordinate inside a query string is
 * already gone before COORD_PAIR runs.
 */
function redact(text) {
  if (typeof text !== 'string' || text.length === 0) return text;
  return text
    .replace(NSEC, '[nsec]')
    .replace(URL_WITH_PATH, '$1/[redacted]')
    .replace(COORD_PAIR, '[coords]')
    .replace(NPUB, '[npub]')
    .replace(HEX_KEY, '[key]');
}

/**
 * The safe form of an error for a log line.
 *
 * Takes the message only — never the error object. `console.error('x:',
 * error)` prints `cause` and the stack too, and for a failed fetch the
 * cause carries the URL again; for an axios-style error the config
 * carries request headers, which is how an ORS API key would end up on
 * disk. One string, redacted, is the whole budget.
 */
function safeErrorMessage(error) {
  if (!error) return 'unknown error';
  const raw = typeof error === 'string' ? error : (error.message || String(error));
  return redact(raw);
}

module.exports = { redact, safeErrorMessage };
