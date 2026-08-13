# Privacy and storage modes

DonkeyRide separates coordination, routing and optional record keeping. Those
services see different data; “encrypted” must never be used as shorthand for
“no personal data.”

| Component | Privacy-default (`blind`) | Managed operator (`managed`) | Why it exists |
|---|---|---|---|
| Participant devices | Exact pickup, drop-off, ordered stops, addresses and notes; NIP-44-encrypted local copy | Same user-facing data | Request, navigation and post-match handoff |
| Coordinator | Geohash-5 cell centres, routed distance/time, stop count, settlement mode, task state, pubkeys, timing and network metadata | Exact itinerary plus coordination state | Discovery, matching and lifecycle |
| Valhalla router | Exact ordered points for the route request; no rider name or task pubkey in the request body | Exact ordered points received from the operator | Road distance, duration and route geometry; prevents point-to-point fare/ETA guesses |
| Address search (Photon by default) | User-entered text and a geohash-5 bias; no automatic exact reverse lookup | Search text and configured bias; managed screens may reverse-geocode exact points | Turn human place names into coordinates; self-host or replace where required |
| Map tiles | Tile coordinates, IP and request metadata; tiles cover an area rather than carry a task id | Same | Draw the map; default tiles come from OpenStreetMap's public service |
| Nostr relay | Gift-wrap ciphertext and its delivery metadata; coarse/expiring discovery events; sealed operator snapshots | Same | Participant exchange, discovery and database-free restart durability |
| PostgreSQL | Not present | Optional when `DATABASE_URL` is explicitly set | Durable records for a firm that chooses to retain them |

## Privacy-default flow

1. The rider selects exact points locally.
2. The browser calls the configured Valhalla `PUBLIC_ROUTING_URL` directly.
3. The browser sends the coordinator geohash-5 pickup/drop-off cells, stop
   count, and Valhalla's distance/time totals. It sends no exact points,
   addresses, notes or route geometry.
4. Drivers discover the task from the coarse cell and accept it.
5. The rider sends the matched driver a signed NIP-17 gift wrap containing the
   exact itinerary. Relays and the coordinator cannot read the content.
6. Each participant stores the exact itinerary NIP-44-encrypted to their own
   device identity. Ordinary session storage holds no exact itinerary.

Blind mode also omits vehicle registration, credential declarations,
women-only declarations, access-needs matching and favourite-provider lists
from the coordinator. Operators that need those regulated/admission features
must select `managed` mode and publish the corresponding data policy.

The coordinator deliberately disables exact driver live-tracking for a blind
task. A driver can use the received exact points in their own navigation app.
Pickup/drop-off mutation, operator-held proof uploads and free-text quote
descriptions are managed-mode features. Privacy-mode participants coordinate
changes and human/payment context in their encrypted chat.

## No-money journeys

`settlement_mode=none` supports informal lifts and shared multi-stop journeys.
It disables all payment methods, stakes, payment instructions, settlement
proofs and tips. It does not collect a passenger name. A numeric stop count and
ordered encrypted itinerary are enough to coordinate the route.

## Residual metadata

Blind mode is data minimisation, not anonymity. IP addresses, request timing,
task ids, coarse location, pubkeys and ciphertext delivery patterns can be
correlated. The routing service necessarily sees exact route points. Operators
must publish which router and relays they use and set appropriate log
retention. Encryption/pseudonymisation do not automatically take data outside
data-protection law.

The browser identity key is currently held in origin-scoped Web Storage so the
PWA can sign after a restart. NIP-44 ciphertext prevents casual cleartext
location recovery, but it does not protect against a compromised origin that
can read both key and ciphertext. Native secure-key storage remains a separate
hardening requirement.
