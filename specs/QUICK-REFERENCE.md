# DonkeyRide Protocol — Quick Reference

**Protocol Version**: v2.0 (Generalised)
**Event Kind Range**: 30500-30699
**Last Updated**: 2026-02-06

---

## Specification Structure

The protocol is organised in layers:

| Document | Scope | Description |
|----------|-------|-------------|
| **NIP-XX-core.md** | Domain-agnostic | Core lifecycle, stakes, reputation, disputes, safety |
| **NIP-XX-ridesharing.md** | Ridesharing extension | Vehicle tracking, navigation, surge pricing, driver management |
| **NIP-XX-locksmith.md** | Locksmith extension | Quote negotiation, access methods, workmanship ratings |
| **NIP-XX-delivery.md** | Delivery extension | Chain of custody, photo proofs, package tracking |
| **NIP-XX-v1-archive.md** | Archive | Original monolithic 82-kind spec (preserved for reference) |

---

## Core Event Kinds (NIP-XX-core)

All domains share these kinds. The `domain` tag identifies which extension applies.

### Task Lifecycle

| Kind | Name | Layer | Replaceable | Publisher |
|------|------|-------|-------------|-----------|
| 30500 | Service Request | Core | Yes | Requester |
| 30501 | Service Acceptance | Core | Yes | Provider |
| 30504 | Service Confirmation | Core | Yes | Operator |
| 30506 | Service Cancellation | Core | No | Either |
| 30507 | Service Start | Core | Yes | Provider |
| 30508 | Service End | Core | Yes | Provider |
| 30512 | Status Update | Core | Yes | Provider/Operator |

### Stake Management

| Kind | Name | Layer | Replaceable | Publisher |
|------|------|-------|-------------|-----------|
| 30502 | Stake Lock | Core | Yes | Operator |
| 30503 | Stake Negotiation | Core | Yes | Either |
| 30509 | Commitment Stake | Core | Yes | Either |
| 30520 | Stake Release | Core | No | Operator |
| 30540 | Operator Bond | Core | Yes | Operator |

### Payments

| Kind | Name | Layer | Replaceable | Publisher |
|------|------|-------|-------------|-----------|
| 30510 | Streaming Payment | Core | No | Requester |
| 30511 | Payment Confirmation | Core | Yes | Operator |
| 30513 | Provider Tip | Core | No | Requester |
| 30523 | Payment Failure | Core | No | Provider/Operator |

### Trust & Reputation

| Kind | Name | Layer | Replaceable | Publisher |
|------|------|-------|-------------|-----------|
| 30517 | Provider Rating | Core | No | Requester |
| 30518 | Requester Rating | Core | No | Provider |
| 30519 | Reputation Summary | Core | Yes | Anyone |
| 30521 | Reputation Export/Import | Core | Yes | Anyone |
| 30528 | Operator Reputation | Core | Yes | Anyone |
| 30530 | Reputation Rating | Core | No | Either |

### Dispute Resolution

| Kind | Name | Layer | Replaceable | Publisher |
|------|------|-------|-------------|-----------|
| 30522 | Dispute Filing | Core | No | Either |
| 30523 | Arbiter Assignment | Core | Yes | Operator |
| 30524 | Dispute Resolution | Core | Yes | Operator/Arbiter |

### Operator Trust

| Kind | Name | Layer | Replaceable | Publisher |
|------|------|-------|-------------|-----------|
| 30525 | Theft Report | Core | No | Anyone |
| 30526 | Watchdog Claim | Core | No | Verifier |
| 30527 | Operator Slashing | Core | No | Verifier |

### Safety & Emergency

| Kind | Name | Layer | Replaceable | Publisher |
|------|------|-------|-------------|-----------|
| 30559 | Emergency Alert | Core | No | Either |
| 30560 | Task Sharing | Core | Yes | Requester |
| 30561 | Safety Check-In Request | Core | No | Operator |
| 30562 | Safety Check-In Response | Core | No | Either |
| 30563 | Safety Check-In Escalation | Core | No | Operator |
| 30564 | Harassment Report | Core | No | Either |

### Abuse Detection

| Kind | Name | Layer | Replaceable | Publisher |
|------|------|-------|-------------|-----------|
| 30549 | Suspicious Activity Report | Core | No | Operator |
| 30550 | Account Suspension | Core | Yes | Operator |
| 30551 | Appeal Request | Core | No | Either |

---

## Ridesharing Extension Kinds (NIP-XX-ridesharing)

Domain: `"ridesharing"` | Roles: rider (requester), driver (provider)

### Financial

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30514 | Wait Time Charge | No | Driver |
| 30515 | No-Show Fee | No | Driver/Operator |
| 30516 | Additional Charge | No | Driver |

### Scheduled & Carpooling

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30505 | Cross-Operator Coordination | Yes | Operator |
| 30529 | Scheduled Ride Request | Yes | Rider |
| 30532 | Carpool Ride Request | Yes | Rider |
| 30533 | Carpool Seat Offer | Yes | Driver |
| 30534 | Carpool Match | Yes | Operator |
| 30535 | Multi-Leg Trip | Yes | Rider |

### Compliance & Edge Cases

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30541 | Wheelchair Accessibility Request | Yes | Rider |
| 30542 | Wheelchair Certification | Yes | Driver |
| 30543 | Fatigue Warning | No | Operator |
| 30544 | Medical Emergency | No | Either |
| 30545 | Accident Report | No | Either |
| 30553 | Location Clarification | Yes | Either |
| 30554 | Pickup Delay Notification | No | Driver |
| 30555 | Driver Break Request | No | Driver |
| 30556 | Ride Extension Request | No | Rider |
| 30557 | Destination Change | No | Rider |
| 30558 | Route Update | Yes | Driver |

### Operational

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30565 | Service Area Definition | Yes | Operator |
| 30566 | Airport Queue Management | Yes | Operator |
| 30567 | Flat Rate Zone | Yes | Operator |
| 30568 | Saved Location | Yes | Rider |
| 30569 | Operator Announcement | No | Operator |

### UX Features

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30570 | Ride Preferences | Yes | Rider |
| 30571 | Lost & Found Report | No | Either |
| 30572 | Lost & Found Match | Yes | Operator |
| 30573 | Referral Code | Yes | Rider |
| 30574 | Promo Code | Yes | Operator |
| 30575 | Split Payment Request | Yes | Rider |
| 30576 | Corporate Account | Yes | Operator |
| 30577 | Favourite Driver | Yes | Rider |

### Driver Management

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30578 | Driver Shift Start | No | Driver |
| 30579 | Driver Shift End | No | Driver |
| 30580 | Driver Earnings Summary | Yes | Driver |
| 30581 | Driver Goal Progress | Yes | Driver |
| 30582 | Driver Performance Metrics | Yes | Operator |

### Navigation

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30583 | Route Suggestion | Yes | Operator |
| 30584 | Turn-by-Turn Navigation | No | Operator |
| 30585 | Traffic Alert | No | Operator |
| 30586 | Reroute Request | No | Driver |
| 30587 | Navigation Feedback | No | Rider |

### Surge & Dynamic Pricing

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30590 | Surge Pricing Zone | Yes | Operator |
| 30591 | Surge Pricing History | No | Operator |
| 30592 | Demand Heatmap | Yes | Operator |

### History & Reporting

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30593 | Ride History Summary | Yes | Rider |
| 30594 | Tax Report | Yes | Driver |

### Verification

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30595 | Background Check Verification | Yes | Operator |
| 30596 | Insurance Verification | Yes | Operator |
| 30597 | Vehicle Inspection | Yes | Operator |
| 30598 | Licence Verification | Yes | Operator |
| 30599 | Training Certification | Yes | Operator |

### Accessibility

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30552 | Accessibility Request | Yes | Rider |
| 30588 | Service Animal Notification | Yes | Rider |
| 30589 | Audio Navigation | Yes | Operator |

### Delivery (Shared)

| Kind | Name | Replaceable | Publisher |
|------|------|-------------|-----------|
| 30546 | Delivery Request | Yes | Sender |
| 30547 | Delivery Proof | No | Courier |
| 30548 | Package Details | Yes | Sender |

---

## Locksmith Extension Kinds (NIP-XX-locksmith)

Domain: `"locksmith"` | Roles: customer (requester), locksmith (provider)

**Kind range reserved**: 30600-30619

State machine: `lockout_reported → locksmith_matched → en_route → arrived → access_method_confirmed → work_active → access_gained → completed`

See NIP-XX-locksmith.md for details.

---

## Delivery Extension Kinds (NIP-XX-delivery)

Domain: `"delivery"` | Roles: sender (requester), courier (provider)

**Kind range reserved**: 30620-30639

State machine: `requested → matched → courier_en_route → courier_arrived → collected → in_transit → arrived_at_delivery → completed`

See NIP-XX-delivery.md for details.

---

## Kind Range Allocation

| Range | Domain | Status |
|-------|--------|--------|
| 30500-30529 | Core protocol | Active |
| 30530-30549 | Core extensions | Active |
| 30549-30569 | Safety, abuse, operational | Active |
| 30570-30599 | Ridesharing | Active |
| 30600-30619 | Locksmith | Reserved |
| 30620-30639 | Delivery | Reserved |
| 30640-30699 | Future domains | Available |

---

## Core State Machine

```
requested → matched → provider_en_route → provider_arrived → [domain states] → active → completed
                                                                                  ↓
                                                                              cancelled
```

Cancellation is valid from any non-terminal state.

---

## Minimum Viable Operator

| Category | Kinds | Count |
|----------|-------|-------|
| Task lifecycle | 30500, 30501, 30506, 30507, 30508, 30512 | 6 |
| Stakes | 30502, 30520 | 2 |
| Payments | 30510, 30511 | 2 |
| Trust | 30517, 30518, 30519 | 3 |
| Safety | 30559 | 1 |
| **Total** | | **14** |

---

## Additional Resources

- **Core Spec**: [NIP-XX-core.md](./NIP-XX-core.md)
- **Ridesharing Extension**: [NIP-XX-ridesharing.md](./NIP-XX-ridesharing.md)
- **Locksmith Extension**: [NIP-XX-locksmith.md](./NIP-XX-locksmith.md)
- **Delivery Extension**: [NIP-XX-delivery.md](./NIP-XX-delivery.md)
- **Architecture**: [../ARCHITECTURE.md](../ARCHITECTURE.md)
- **Trust Mechanisms**: [../TRUST-MECHANISMS.md](../TRUST-MECHANISMS.md)
- **Original Spec (Archive)**: [NIP-XX-v1-archive.md](./NIP-XX-v1-archive.md)
