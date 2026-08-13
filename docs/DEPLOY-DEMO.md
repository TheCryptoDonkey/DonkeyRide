# Deploying a public demo instance

The privacy-default demo stack runs an ephemeral coordinator plus a Nostr
relay behind any TLS reverse proxy. It has no PostgreSQL and no Redis. Ports
bind to loopback only — the proxy is the sole public surface.

## 1. Start the stack

```bash
docker compose -f docker-compose.demo.yml \
  -f docker-compose.private-routing.yml up -d --build
```

This exposes on the host:

- `127.0.0.1:3999` — HTTP API + built web app
- `127.0.0.1:3998` — WebSocket

The operator runs with `OPERATOR_DATA_MODE=blind`, `ENABLE_NIP98_AUTH=true`
and `ENABLE_RATE_LIMITING=true`. Active coordinator state is in memory;
minimal NIP-44-sealed snapshots can rehydrate it through the configured Nostr
relay. Exact itineraries remain encrypted to participant devices.

## 2. Front with Caddy (automatic TLS)

```caddyfile
donkeyride.example.com {
	@ws path /ws
	reverse_proxy @ws localhost:3998
	handle_path /routing/* {
		reverse_proxy localhost:8002
	}
	handle_path /relay* {
		reverse_proxy localhost:3997
	}
	reverse_proxy localhost:3999
}
```

The web app connects its WebSocket to `wss://<host>/ws` automatically when
served over HTTPS, so no frontend configuration is needed. HTTPS is required
for a working demo on phones — browser geolocation and the service worker
only run in secure contexts.

No domain yet? `donkeyride.<server-ip>.sslip.io` resolves to your server
without any DNS setup and Caddy will issue a certificate for it.

## 3. Operator identity and Nostr relays

The demo stack now includes a strfry Nostr relay (loopback `:3997`,
proxied at `/relay`). Give the operator a stable signing identity and
advertise client-reachable relay URLs in a `.env` next to the compose file:

```bash
umask 077
cat > .env <<ENV
OPERATOR_PRIVKEY=$(openssl rand -hex 32)
NODE_ENV=production
ALLOW_DEMO_PAYMENTS=true
NOSTR_RELAYS=wss://relay.trotters.cc
PUBLIC_RELAY_URLS=wss://relay.trotters.cc,wss://donkeyride.example.com/relay,wss://relay.damus.io
PUBLIC_BASE_URL=https://donkeyride.example.com
ENV
```

`NOSTR_RELAYS` is where the OPERATOR publishes (snapshots, bond, heartbeat) —
name a relay you control. There is no fallback: leave it empty and the
operator publishes nowhere, which costs you snapshot durability.

`PUBLIC_RELAY_URLS` is a different thing: it is advertised to CLIENTS, who use
it for end-to-end encrypted chat, signed ratings and cross-operator discovery.
Those are *meant* to be publicly readable and portable between operators, so
keep a public relay or two in this list — narrowing it to your own relay makes
a driver's reputation invisible to anyone not pointed at you, which defeats
the point of portable reputation.

Without `OPERATOR_PRIVKEY` (or `OPERATOR_NSEC`) the operator cannot sign
any public events — stake locks, settlements, its service announcement —
and says so loudly at boot. With it, the operator publishes a TROTT kind
30511 announcement at startup and a kind 30554 heartbeat every 5 minutes,
making it discoverable from the relays alone.

## 4. Verify

```bash
curl https://donkeyride.example.com/health
curl -X POST https://donkeyride.example.com/api/rides/request   # expect 401 (auth on)
```

Then open the site on a phone, add to home screen, and run a ride end to end
with two browsers (one rider, one driver going online).

Also verify the advertised boundary and the road router:

```bash
curl https://donkeyride.example.com/info
curl -X POST https://donkeyride.example.com/routing/route \
  -H 'content-type: application/json' \
  --data '{"locations":[{"lat":53.4808,"lon":-2.2426},{"lat":53.4774,"lon":-2.2309}],"costing":"auto","units":"kilometers"}'
```

## Notes

- This is a **demo** configuration: single node and ephemeral coordination.
  For a real operator deployment see
  `DOCKER-SETUP.md` and the payment provider guide.
- Blind mode requires browser-reachable Valhalla tiles covering the operating
  region. A missing road route fails visibly; no point-to-point distance is
  substituted.
- A firm that deliberately needs roster, credentials, special-category
  matching or durable records selects `OPERATOR_DATA_MODE=managed` and may
  add `DATABASE_URL` under its own data-protection policy.
