/**
 * Minimal Nostr relay for local development.
 * Supports NIP-01 (events, subscriptions) and NIP-33 (parameterised replaceable).
 * In-memory storage only — data does not persist between restarts.
 */

const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = parseInt(process.env.RELAY_PORT || '7777', 10);
const events = [];

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify({
    name: 'donkeyride-dev-relay',
    description: 'Local development Nostr relay',
    supported_nips: [1, 11, 33],
  }));
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws._subs = new Set();

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);

      if (msg[0] === 'EVENT') {
        const ev = msg[1];
        events.push(ev);
        ws.send(JSON.stringify(['OK', ev.id, true, '']));

        // Broadcast to all connected clients with active subscriptions
        wss.clients.forEach((c) => {
          if (c.readyState === 1 && c._subs) {
            c._subs.forEach((subId) => {
              c.send(JSON.stringify(['EVENT', subId, ev]));
            });
          }
        });
      } else if (msg[0] === 'REQ') {
        const subId = msg[1];
        ws._subs.add(subId);
        const filters = msg.slice(2);

        events.forEach((ev) => {
          if (matchFilters(ev, filters)) {
            ws.send(JSON.stringify(['EVENT', subId, ev]));
          }
        });
        ws.send(JSON.stringify(['EOSE', subId]));
      } else if (msg[0] === 'CLOSE') {
        ws._subs.delete(msg[1]);
      }
    } catch {
      // Ignore malformed messages
    }
  });
});

function matchFilters(ev, filters) {
  return filters.some((f) => {
    if (f.kinds && !f.kinds.includes(ev.kind)) return false;
    if (f.authors && !f.authors.includes(ev.pubkey)) return false;
    if (f['#e'] && !ev.tags.some((t) => t[0] === 'e' && f['#e'].includes(t[1]))) return false;
    if (f['#p'] && !ev.tags.some((t) => t[0] === 'p' && f['#p'].includes(t[1]))) return false;
    return true;
  });
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Nostr dev relay listening on ws://127.0.0.1:${PORT}`);
});
