# Deploy the static PWA

The public DonkeyRide product is a static rider/driver PWA. It does not need a
DonkeyRide operator, PostgreSQL, Redis or a DonkeyRide WebSocket server.

It does need independently selectable network services:

- one or more Nostr relays for discovery and encrypted message delivery;
- a Valhalla-compatible road router for ordered route distance, time and shape;
- a geocoder and map tiles (Photon and OpenStreetMap defaults can be replaced).

## Build

```bash
cd web
npm ci
VITE_COORDINATION_MODE=direct \
VITE_NOSTR_RELAYS=wss://relay.damus.io,wss://nos.lol \
VITE_PUBLIC_ROUTING_URL=/routing \
npm run build
```

`/routing` is convenient when the static host reverse-proxies a router. To keep
the static host outside route processing, use an HTTPS router URL that permits
browser CORS instead. Users can change both relay and router settings later in
Account → Open network services.

## Caddy

```caddyfile
ride.example.com {
	encode zstd gzip

	# Optional same-origin routing proxy. This receives exact ordered points.
	handle_path /routing/* {
		reverse_proxy 127.0.0.1:8002
	}

	# Prove no old DonkeyRide coordinator is accidentally exposed.
	@coordinator path /api/* /info /health /ws
	respond @coordinator 404

	# A missing APK must be a real 404, never the PWA shell renamed .apk.
	@downloads path /download.html /downloads/*
	handle @downloads {
		root * /srv/donkeyride-pwa
		file_server
	}

	@driver path /provide /provide/* /drive /drive/*
	handle @driver {
		root * /srv/donkeyride-pwa
		rewrite * /driver.html
		file_server
	}

	handle {
		root * /srv/donkeyride-pwa
		try_files {path} /index.html
		file_server
	}
}
```

Copy `web/dist/` to `/srv/donkeyride-pwa` using an atomic release directory or
equivalent deployment mechanism, then reload Caddy. Do not route `/api`,
`/info` or `/ws` to the reference operator on a direct-only host.

To ship the native direct Android driver too, build it before the final PWA
build so Vite copies the gitignored release artifacts into `web/dist/`:

```bash
scripts/publish-driver-apk.sh direct https://ride.example.com
cd web
VITE_COORDINATION_MODE=direct \
VITE_NOSTR_RELAYS=wss://relay.damus.io,wss://nos.lol \
VITE_PUBLIC_ROUTING_URL=https://ride.example.com/routing \
npm run build
```

`apksigner` is mandatory: the publish script refuses to advertise an unsigned
or unverifiable file. Preserve and back up `web/android/keystore.properties`
and its keystore; changing the signing key prevents Android updating existing
installs. The public page is `/download.html` and its machine-readable contract
is `/downloads/driver-app.json`.

## Verify

```bash
curl -fsS https://ride.example.com/ >/dev/null
curl -fsS https://ride.example.com/provide >/dev/null
test "$(curl -sS -o /dev/null -w '%{http_code}' https://ride.example.com/info)" = 404
test "$(curl -sS -o /dev/null -w '%{http_code}' https://ride.example.com/api/tasks/open)" = 404
curl -fsS https://ride.example.com/download.html | grep -q 'DonkeyRide Driver for Android'
curl -fsS https://ride.example.com/downloads/driver-app.json
test "$(curl -sS -o /dev/null -w '%{http_code}' https://ride.example.com/downloads/missing.apk)" = 404
```

Then run the direct Playwright contract locally before publishing:

```bash
cd web
npm run test:ui:direct

# After deployment: mobile UI, denied GPS, coordinator 404s and road routing
npm run test:ui:live
```

The test uses synthetic Manchester locations, a standards-shaped in-memory
Nostr relay, mocked Photon/map/routing responses, and aborts any attempted
coordinator request. It never asks the test machine for a real location.

## Operational boundary

Static hosting can still log visitor IPs and asset requests. A same-origin
`/routing` proxy can log exact route points unless access/body logging is
disabled and retention is controlled. Public relays can correlate timing,
network address, anonymous per-shift availability keys, coarse cells and
encrypted envelope traffic. The shift key is not cryptographically linked to
the account or another shift, but IP/timing can still correlate it. NIP-40
expiration is advisory to relays and is not proof of deletion.

If a firm chooses managed mode, deploy the reference operator separately and
publish its policy. That firm decides whether PostgreSQL/Redis are enabled and
accepts the resulting record-keeping and regulatory obligations.
