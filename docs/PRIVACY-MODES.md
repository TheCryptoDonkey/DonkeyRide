# Privacy and storage modes

DonkeyRide separates the static app, relay delivery, road routing and optional
operator records. Encryption is not shorthand for anonymity or for “no PII.”

| Component | Direct PWA (default) | Optional managed operator | Why it exists |
|---|---|---|---|
| Participant device | Exact itinerary and lifecycle; encrypted local records; AES-GCM-wrapped identity secret | Same UI data plus the selected operator contract | Signing, navigation, recovery |
| Static host | Asset requests and ordinary request metadata only | May also host the managed UI | Deliver the installable PWA |
| Nostr relay | Coarse/expiring availability and task events; gift-wrap ciphertext; pubkeys, IP/timing and envelope metadata | Portable reputation/chat plus any operator-published events | Discovery and message delivery |
| Road router | Exact ordered points; no DonkeyRide pubkey or journey id in the route body | Exact points either client-direct or operator-originated, per policy | Road distance, duration and geometry; no point-to-point guess |
| Photon/search | Typed place text and geohash-5 bias | Same unless the operator replaces it | Human place search |
| Map tiles | Tile coordinates and request metadata | Same unless replaced | Map display |
| DonkeyRide coordinator | Absent | Lifecycle, admission and data defined by its published policy | Fleet/regulatory operation |
| PostgreSQL/Redis | Absent | Optional and disabled unless configured by the operator | Durable records/cache chosen by that operator |

## Direct journey flow

1. A driver who taps Go Online creates a random, memory-only shift identity and
   publishes kind `20500` availability under it with a geohash-5 cell and
   two-minute expiration. The account/reputation identity never signs this
   location event. The same anonymous author is reused within one online shift
   so riders replace its last position rather than double-count it; Go Offline
   discards it. It is an ephemeral kind and refreshes every 15 seconds.
2. A rider selects exact pickup, ordered intermediate stops and drop-off in the
   PWA. If location permission is denied, they choose pickup manually; the
   London map-framing fallback is never treated as their position.
3. The PWA sends those ordered points directly to the selected
   Valhalla-compatible router. The returned road distance, time and geometry
   are used; no straight-line estimate is substituted.
4. The rider generates a per-journey rendezvous key and publishes a signed kind
   `37500` event. It contains only task id, pickup/drop-off geohash-5 cells,
   stop count, road totals, settlement mode, status and expiration. It does not
   contain the rider's durable pubkey, exact points, addresses, notes or route
   geometry.
5. A driver reviews the coarse offer and sends an encrypted NIP-17 acceptance
   to the rendezvous key. The rider confirms the first acceptance and closes
   the public announcement.
6. The rider and driver exchange their durable pubkeys inside encrypted
   messages. The exact itinerary then travels in its own verified NIP-17 gift
   wrap. Relays cannot read it.
7. Arrival, start, completion and cancellation travel as participant-to-
   participant encrypted lifecycle messages. There is no DonkeyRide API or
   operator WebSocket in this path.

Both parties must have the PWA open and connected while establishing the
match. A static PWA has no central push service to wake a suspended browser.
The native wrapper can integrate user-selected notification transport, but a
direct browser match should not be advertised as background-guaranteed.

## Identity separation and device encryption

Fresh installations generate one unpublished `nsec-tree` root. Direct rider
and driver identities derive from separate purpose strings. Managed identities
also include a SHA-256-derived identifier for the selected operator origin, so
the same person does not present a common pubkey to unrelated firms. No linkage
proof is published. Compromise of a child does not reveal the root or a sibling;
compromise of the root can recreate every child and has no forward secrecy.

Only the root is persisted, AES-GCM encrypted under a non-exportable WebCrypto
wrapping key stored by the origin in IndexedDB. One root recovery nsec restores
all deterministic personas. Existing installations are deliberately not
auto-migrated because changing their pubkey would strand ratings and contacts;
Account offers a warned, explicit "start fresh" action that clears both old role
keys only after the new encrypted root is stored.

Exact journey and rendezvous records are separately NIP-44 encrypted to the
participant identity. Ordinary session storage receives only geohash-centred
task data, never exact points, address labels, notes or route geometry.

This protects against a casual Web Storage export and at-rest file inspection.
It does not defeat malicious JavaScript executing under the app origin: code
running while the user is in the app can use the non-exportable wrapping key or
the already-loaded Nostr identity. Native OS keystores remain stronger for a
packaged mobile app.

## No-money and multi-stop journeys

`settlement_mode=none` is a first-class journey, not a zero-price payment. It
disables payment methods, stakes, payment instructions, proofs and tips.
Ordered intermediate stops are included in the road-router request and only in
the encrypted participant itinerary. Public discovery exposes the number of
stops, not who will be collected or the stop addresses.

That supports friends, neighbours, a parent collecting several people, or an
informal delivery-style route without inventing a commercial fare or requiring
a passenger manifest.

## Managed operator mode

A taxi company, licensed fleet or other operator can explicitly select an
HTTPS operator in Account. That changes the runtime to authenticated REST/WSS
coordination. The operator publishes whether it is open/regulated, its
admission rules, its data mode and its record backend.

`OPERATOR_DATA_MODE=blind` withholds exact itinerary from that coordinator;
`managed` permits operator-readable records and features that depend on them.
Setting `DATABASE_URL` or `REDIS_URL` is an operator decision, not a dependency
of the PWA. Operators must make their own retention, security and regulatory
decisions rather than inheriting a “no PII” claim from this software.

## Residual metadata and deletion limits

Direct mode minimises content but still exposes correlatable metadata: network
addresses, timing, per-shift random pubkeys, coarse cells, per-journey
rendezvous pubkeys, event sizes and counterpart delivery patterns. Shift keys
prevent a cryptographic join to the account or another shift, but relay-visible
IP and timing can still correlate them. The selected router sees exact route
points. The search service sees typed places. The static host may log normal
requests.

NIP-40 expiration asks relays to stop serving expired events; it does not prove
that a relay or passive subscriber deleted a copy. Public availability is
therefore both coarse and short-lived, but it must still be treated as
potentially recorded personal data.
