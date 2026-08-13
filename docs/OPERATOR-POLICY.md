# Operator policy and network participation

DonkeyRide is software and a network protocol. It does not issue taxi
licences, declare a driver legal, or appoint a central operator. Each person
or organisation that runs a backend is responsible for its own market and
publishes the rules that its backend actually enforces.

The rider and driver apps are portable. They use their bundled operator only
as a bootstrap, discover other operators through signed Nostr kind `30511`
announcements, confirm the live policy over `GET /info`, and let the user
switch at runtime. Rider maps aggregate coarse live driver availability from
reachable operators. Driver apps subscribe to coarse, expiring task
announcements across operators, so a small operator is not an isolated pool.

## Open operator

This is the minimum-friction configuration for a community market, co-op, or
place where the operator does not gate the driver roster:

```dotenv
OPERATOR_POLICY_MODE=open
OPERATOR_ADMISSION_MODE=open
OPERATOR_RECORD_MODE=ephemeral
FEDERATION_CORS=true
```

Any authenticated driver identity may go online. Credentials can still be
declared and shown to a rider, but the operator does not claim to have checked
them.

## Firm or regulated operator

A taxi company or locally regulated operator can use the same code and apps
while controlling its own fleet:

```dotenv
OPERATOR_POLICY_MODE=regulated
OPERATOR_ADMISSION_MODE=allowlist_and_credentials
OPERATOR_ALLOWED_DRIVERS=<driver hex pubkey>,npub1...
OPERATOR_RECORD_MODE=durable
DATABASE_URL=postgres://donkeyride:change-me@postgres/donkeyride
OPERATOR_TERMS_URL=https://example.com/terms
OPERATOR_PRIVACY_URL=https://example.com/privacy
OPERATOR_CONTACT=dispatch@example.com
FEDERATION_CORS=true
```

`allowlist` means the operator has admitted that Nostr identity to its own
roster. DonkeyRide does not prescribe why or label that person “licensed.”
That lets the operator attach its own off-chain checks, contracts, insurance
workflow, or licensing system without forking the apps or protocol.

`credentials` are device declarations and are explicitly published as
`self_attested`. Combining the roster and required declarations makes both
conditions necessary. A future credential authority can sit behind the
operator's roster process without becoming a network-wide dependency.

If `OPERATOR_POLICY_MODE=regulated` uses an allowlist mode but the roster is
empty, the server refuses to start. If `OPERATOR_RECORD_MODE=durable` is set
but the configured database cannot start, the server also refuses to start.
It will never advertise those controls while silently running open or in
memory.

Community Lift is available to either an open or regulated operator, but its
active task data includes passenger names, exact ordered drop-offs and
guardian-code HMACs. In production it therefore fails closed unless the
operator has PostgreSQL plus a stable `TASK_DATA_ENCRYPTION_KEY` of at least
32 characters. Payloads are AES-256-GCM encrypted while active. At completion
or cancellation, the durable copy automatically drops exact locations,
addresses, child and guardian names, route geometry and handoff digests.

## Public contract

`GET /info` publishes `policy.schema = org.donkeyride.operator-policy/v1`:

```json
{
  "mode": "regulated",
  "admission": {
    "mode": "allowlist_and_credentials",
    "assurance": "operator_roster_and_self_attested",
    "requiredCredentials": ["phv_licence", "hire_reward_insurance"],
    "allowlistSize": 12
  },
  "records": { "mode": "durable", "backend": "postgres" }
}
```

The roster identities themselves are never exposed. The signed kind `30511`
announcement carries only the policy schema/mode, admission mode, record mode,
service URL, domains and public relay URLs. Clients treat relay data as
discovery and the live HTTPS response as current truth.

## Cross-origin security

`FEDERATION_CORS=true` allows a browser app served by one operator to call a
second operator. This does not bypass access control: DonkeyRide uses no
cookie session, and participant-only data/actions require a NIP-98 signature
from the relevant user. An operator can set it to `false` and explicitly list
browser origins in `ALLOWED_ORIGINS`, but that operator will not be usable by
arbitrary network PWAs.

## Private routing

Operators can use a local OSRM (`OSRM_URL`) or Valhalla
(`NAVIGATION_PROVIDER=valhalla`, `VALHALLA_URL`). Neither mode needs a third
party to receive exact journey endpoints. If the configured router is down,
ordinary priced domains fall back to straight-line distance and say
`routed: false`. Community Lift fails closed instead: it cannot be arranged
until a real multi-stop road route exists.

When Valhalla already runs on a private Docker network, attach only the
operator container with the supplied overlay:

```sh
ROUTING_NETWORK=routing_default docker compose \
  -f docker-compose.demo.yml \
  -f docker-compose.private-routing.yml up -d --build
```

The overlay defaults to the private service name `http://valhalla:8002` and
does not publish a routing port.
