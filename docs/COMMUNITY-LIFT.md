# Community Lift go-live contract

Community Lift is a non-commercial, multi-passenger journey. One organiser
chooses a meeting point, adds up to six passengers in drop-off order and
keeps a separate four-digit handoff code for each passenger on their device.
The driver navigates to the next unfinished drop-off, marks arrival and enters
the code supplied by the receiving adult. The lift cannot be completed until
every handoff succeeds.

There is no fare, stake, waiting charge, tip, payment method or settlement
record. The backend records `settlement: not_required` and custody `none`.
The routing backend must return a real road route through every stop; this
domain never substitutes a straight line.

## Operator modes

The same app works against both operator postures:

- An open operator admits any authenticated driver. A DBS/safeguarding claim
  is displayed as self-attested and is not represented as verified.
- A firm can set `OPERATOR_ADMISSION_MODE=allowlist_and_credentials` and run
  its own roster/checking process. The software does not issue licences or
  decide which rules apply.

Production Community Lift requests are enabled only when all of these are
true:

```dotenv
ENABLE_NIP98_AUTH=true
DATABASE_URL=postgresql://...
TASK_DATA_ENCRYPTION_KEY=<stable high-entropy secret, at least 32 characters>
NAVIGATION_PROVIDER=valhalla
VALHALLA_URL=http://valhalla:8002
```

For the supplied public-demo stack, enable the private router and encrypted
storage overlays together:

```sh
docker compose -f docker-compose.demo.yml \
  -f docker-compose.private-routing.yml \
  -f docker-compose.community-lift.yml up -d --build
```

Generate the encryption key once with `openssl rand -base64 32`, store it in
the operator's secret manager and back it up securely. Do not rotate it while
active tasks or retained encrypted records exist. `HANDOFF_HMAC_SECRET` can be
set separately; otherwise the stable encryption/operator key is used.

The private store is required because the public Nostr recovery snapshot is
intentionally too coarse to reconstruct a child journey: it does not contain
passenger names, exact drop-offs or code digests. While a task is active, the
PostgreSQL JSON payload is AES-256-GCM encrypted. On completion or cancellation
the durable payload is rewritten without exact route/location data, child or
guardian names, free-text notes or handoff secrets.

## Privacy-safe verification

Never grant the test browser a person's real location. The committed phone
test uses distinct synthetic Manchester and Salford coordinates for organiser
and driver, mocks map/geocoder traffic, and runs headlessly:

```sh
npm test
npm run web:test
npm run web:build
npm --prefix web run test:ui -- --grep "parent and driver complete"
```

The end-to-end test proves the routed polyline has multiple road points, only
a driver working in the Community Lift domain receives the offer, passenger
details are hidden before acceptance, organiser and driver locations differ,
navigation advances to each drop-off, every handoff is required and no money
path is exposed. Backend integration coverage additionally proves incorrect
code lockout and organiser-controlled replacement-code behaviour.
