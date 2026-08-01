# Deploying a public demo instance

The demo stack runs the operator with PostgreSQL persistence and Redis behind
any TLS reverse proxy. Ports bind to loopback only — the proxy is the sole
public surface.

## 1. Start the stack

```bash
docker compose -f docker-compose.demo.yml up -d --build
```

This exposes on the host:

- `127.0.0.1:3999` — HTTP API + built web app
- `127.0.0.1:3998` — WebSocket

The operator runs with `PAYMENT_PROVIDER=demo`, `ENABLE_NIP98_AUTH=true` and
`ENABLE_RATE_LIMITING=true`. Persistence is PostgreSQL (tasks survive
restarts and are rehydrated on startup).

## 2. Front with Caddy (automatic TLS)

```caddyfile
donkeyride.example.com {
	@ws path /ws
	reverse_proxy @ws localhost:3998
	reverse_proxy localhost:3999
}
```

The web app connects its WebSocket to `wss://<host>/ws` automatically when
served over HTTPS, so no frontend configuration is needed. HTTPS is required
for a working demo on phones — browser geolocation and the service worker
only run in secure contexts.

No domain yet? `donkeyride.<server-ip>.sslip.io` resolves to your server
without any DNS setup and Caddy will issue a certificate for it.

## 3. Verify

```bash
curl https://donkeyride.example.com/health
curl -X POST https://donkeyride.example.com/api/rides/request   # expect 401 (auth on)
```

Then open the site on a phone, add to home screen, and run a ride end to end
with two browsers (one rider, one driver going online).

## Notes

- This is a **demo** configuration: demo payment rail, throwaway Postgres
  password, single node. For a real operator deployment see
  `DOCKER-SETUP.md` and the payment provider guide.
- Routing falls back to straight-line estimates unless `OSRM_URL` points at
  a routing engine covering your region.
