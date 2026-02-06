# DonkeyRide Protocol — Quick Reference

**Protocol Version**: v2.0 (Generalised)
**Event Kind Range**: 30500-30699
**Last Updated**: 2026-02-06

> **Note**: The protocol specification has been generalised and split into layers. The canonical quick reference is now at **[specs/QUICK-REFERENCE.md](./specs/QUICK-REFERENCE.md)**. The tables below are preserved for backward compatibility but may be outdated.

---

## Event Kind Table

### Core Events (15)

| Kind | Name | Description | Replaceable |
|------|------|-------------|-------------|
| 30500 | Ride Request | Rider requests a ride from point A to B | Yes (NIP-33) |
| 30501 | Ride Offer | Driver accepts ride request | Yes (NIP-33) |
| 30502 | Ride Acceptance | Rider confirms driver selection | Yes (NIP-33) |
| 30503 | Driver Online Status | Driver availability and current location | Yes (NIP-33) |
| 30504 | Ride Confirmation | Final confirmation before driver departs | Yes (NIP-33) |
| 30505 | Cross-Operator Coordination | Multi-operator ride coordination (future) | Yes (NIP-33) |
| 30506 | Ride Cancellation | Either party cancels ride | No (append-only) |
| 30507 | Ride Start | Driver starts trip (pickup complete) | Yes (NIP-33) |
| 30508 | Ride End | Driver ends trip (dropoff complete) | Yes (NIP-33) |
| 30509 | Commitment Stake | Rider/driver posts refundable commitment stake | Yes (NIP-33) |
| 30510 | Streaming Payment | Lightning payment stream during ride | No (append-only) |
| 30511 | Payment Confirmation | Final payment settled and confirmed | Yes (NIP-33) |
| 30512 | Status Update | Real-time status updates during ride | Yes (NIP-33) |
| 30557 | Destination Change | Rider requests mid-ride destination change | No (append-only) |
| 30558 | Route Update | Driver updates route or ETA | Yes (NIP-33) |

---

### Trust & Reputation (11)

| Kind | Name | Description | Replaceable |
|------|------|-------------|-------------|
| 30517 | Driver Rating | Rider rates driver after ride completion | No (append-only) |
| 30518 | Rider Rating | Driver rates rider after ride completion | No (append-only) |
| 30519 | Reputation Summary | Aggregated reputation stats (stars, ride count) | Yes (NIP-33) |
| 30521 | Reputation Export/Import | Transfer reputation between operators | Yes (NIP-33) |
| 30522 | Dispute Filing | Formal dispute over payment/conduct | No (append-only) |
| 30523 | Arbiter Assignment | Dispute arbiter selected for case | Yes (NIP-33) |
| 30524 | Dispute Resolution | Arbiter's final ruling on dispute | Yes (NIP-33) |
| 30525 | Theft Report | Report suspected operator theft | No (append-only) |
| 30526 | Watchdog Claim | Third-party proof of operator misbehavior | No (append-only) |
| 30527 | Operator Slashing | Stake slashing for proven misbehavior | No (append-only) |
| 30528 | Operator Reputation | Public operator reputation and stats | Yes (NIP-33) |

---

### Safety & Emergency (6)

| Kind | Name | Description | Replaceable |
|------|------|-------------|-------------|
| 30559 | Emergency Alert | Panic button / SOS alert triggered | No (append-only) |
| 30560 | Trip Sharing | Follow My Ride - share live location | Yes (NIP-33) |
| 30561 | Safety Check-In Request | Automated safety check-in prompt | No (append-only) |
| 30562 | Safety Check-In Response | User responds to safety check-in | No (append-only) |
| 30563 | Safety Check-In Escalation | No response - escalate to emergency | No (append-only) |
| 30564 | Harassment Report | Report harassment or inappropriate conduct | No (append-only) |

---

### Verification (5)

| Kind | Name | Description | Replaceable |
|------|------|-------------|-------------|
| 30595 | Background Check Verification | Driver background check status | Yes (NIP-33) |
| 30596 | Insurance Verification | Vehicle insurance verification | Yes (NIP-33) |
| 30597 | Vehicle Inspection | Vehicle inspection certificate | Yes (NIP-33) |
| 30598 | License Verification | Driver's license verification | Yes (NIP-33) |
| 30599 | Training Certification | Driver training completion status | Yes (NIP-33) |

---

### Financial (4)

| Kind | Name | Description | Replaceable |
|------|------|-------------|-------------|
| 30513 | Driver Tip | Post-ride tip (100% to driver) | No (append-only) |
| 30514 | Wait Time Charge | Additional charge for rider delay | No (append-only) |
| 30515 | No-Show Fee | Charge when rider doesn't show up | No (append-only) |
| 30516 | Additional Charge | Mid-ride additional charges (tolls, cleanup) | No (append-only) |

---

### Operational (5)

| Kind | Name | Description | Replaceable |
|------|------|-------------|-------------|
| 30565 | Service Area Definition | Geofenced service area boundaries | Yes (NIP-33) |
| 30566 | Airport Queue Management | Airport pickup queue position | Yes (NIP-33) |
| 30567 | Flat Rate Zone | Fixed-price zone definitions | Yes (NIP-33) |
| 30568 | Saved Location | User's saved addresses (home, work) | Yes (NIP-33) |
| 30569 | Operator Announcement | Public announcements from operator | No (append-only) |

---

### UX Features (8)

| Kind | Name | Description | Replaceable |
|------|------|-------------|-------------|
| 30570 | Ride Preferences | User preferences (music, temp, quiet) | Yes (NIP-33) |
| 30571 | Lost & Found Report | Report lost item in vehicle | No (append-only) |
| 30572 | Lost & Found Match | Match lost item to specific ride | Yes (NIP-33) |
| 30573 | Referral Code | User referral code for bonuses | Yes (NIP-33) |
| 30574 | Promo Code | Promotional discount code | Yes (NIP-33) |
| 30575 | Split Payment Request | Request to split fare with others | Yes (NIP-33) |
| 30576 | Corporate Account | Business account for employee rides | Yes (NIP-33) |
| 30577 | Favorite Driver | Mark driver as favorite for future rides | Yes (NIP-33) |

---

### Compliance (3)

| Kind | Name | Description | Replaceable |
|------|------|-------------|-------------|
| 30540 | Age Verification | Verify rider age for alcohol/tobacco delivery | Yes (NIP-33) |
| 30541 | Wheelchair Accessibility Request | Request wheelchair-accessible vehicle | Yes (NIP-33) |
| 30542 | Wheelchair Certification | Driver/vehicle wheelchair certification | Yes (NIP-33) |
| 30543 | Fatigue Warning | Driver fatigue monitoring alert | No (append-only) |

---

### Edge Cases (7)

| Kind | Name | Description | Replaceable |
|------|------|-------------|-------------|
| 30553 | Location Clarification | Resolve ambiguous pickup/dropoff location | Yes (NIP-33) |
| 30554 | Pickup Delay Notification | Driver notifies rider of delay | No (append-only) |
| 30555 | Driver Break Request | Driver requests pause for bathroom/fuel | No (append-only) |
| 30556 | Ride Extension Request | Extend ride to new destination | No (append-only) |
| 30520 | Vehicle Breakdown | Vehicle malfunction during ride | No (append-only) |
| 30544 | Medical Emergency | Medical emergency during ride | No (append-only) |
| 30545 | Accident Report | Traffic accident during ride | No (append-only) |

---

### Scheduled Rides (3)

| Kind | Name | Description | Replaceable |
|------|------|-------------|-------------|
| 30529 | Scheduled Ride Request | Request ride for future time | Yes (NIP-33) |
| 30530 | Scheduled Ride Acceptance | Driver accepts scheduled ride | Yes (NIP-33) |
| 30531 | Scheduled Ride Reminder | Reminder for upcoming scheduled ride | No (append-only) |

---

### Carpooling & Multi-Leg (4)

| Kind | Name | Description | Replaceable |
|------|------|-------------|-------------|
| 30532 | Carpool Ride Request | Request shared ride with other riders | Yes (NIP-33) |
| 30533 | Carpool Seat Offer | Driver offers available seats | Yes (NIP-33) |
| 30534 | Carpool Match | Match riders going same direction | Yes (NIP-33) |
| 30535 | Multi-Leg Trip | Multi-stop trip definition | Yes (NIP-33) |

---

### Surge & Dynamic Pricing (3)

| Kind | Name | Description | Replaceable |
|------|------|-------------|-------------|
| 30590 | Surge Pricing Zone | Active surge pricing zone definition | Yes (NIP-33) |
| 30591 | Surge Pricing History | Historical surge pricing data | No (append-only) |
| 30592 | Demand Heatmap | Real-time demand visualization | Yes (NIP-33) |

---

### Driver Management (5)

| Kind | Name | Description | Replaceable |
|------|------|-------------|-------------|
| 30578 | Driver Shift Start | Driver begins work shift | No (append-only) |
| 30579 | Driver Shift End | Driver ends work shift | No (append-only) |
| 30580 | Driver Earnings Summary | Daily/weekly earnings report | Yes (NIP-33) |
| 30581 | Driver Goal Progress | Progress toward earnings goals | Yes (NIP-33) |
| 30582 | Driver Performance Metrics | Performance stats (acceptance rate, etc.) | Yes (NIP-33) |

---

### Navigation (5)

| Kind | Name | Description | Replaceable |
|------|------|-------------|-------------|
| 30583 | Route Suggestion | Suggested route from A to B | Yes (NIP-33) |
| 30584 | Turn-by-Turn Navigation | Navigation instructions | No (append-only) |
| 30585 | Traffic Alert | Real-time traffic alerts | No (append-only) |
| 30586 | Reroute Request | Request alternate route | No (append-only) |
| 30587 | Navigation Feedback | Report navigation accuracy | No (append-only) |

---

### Delivery (3)

| Kind | Name | Description | Replaceable |
|------|------|-------------|-------------|
| 30546 | Delivery Request | Request package/food delivery | Yes (NIP-33) |
| 30547 | Delivery Proof | Photo/signature proof of delivery | No (append-only) |
| 30548 | Package Details | Package size/weight/special handling | Yes (NIP-33) |

---

### History & Reporting (2)

| Kind | Name | Description | Replaceable |
|------|------|-------------|-------------|
| 30593 | Ride History Summary | User's historical ride statistics | Yes (NIP-33) |
| 30594 | Tax Report | Annual tax report for drivers | Yes (NIP-33) |

---

### Abuse Detection (3)

| Kind | Name | Description | Replaceable |
|------|------|-------------|-------------|
| 30549 | Suspicious Activity Report | Fraud/abuse detection alert | No (append-only) |
| 30550 | Account Suspension | Account suspended by operator | Yes (NIP-33) |
| 30551 | Appeal Request | Appeal suspension or ban | No (append-only) |

---

### Accessibility (3)

| Kind | Name | Description | Replaceable |
|------|------|-------------|-------------|
| 30552 | Accessibility Request | Request accessible vehicle features | Yes (NIP-33) |
| 30588 | Service Animal Notification | Rider traveling with service animal | Yes (NIP-33) |
| 30589 | Audio Navigation | Audio-only navigation for blind drivers | Yes (NIP-33) |

---

## Event Categories Summary

| Category | Event Kinds | Count |
|----------|-------------|-------|
| Core Events | 30500-30512, 30557-30558 | 15 |
| Trust & Reputation | 30517-30519, 30521-30528 | 11 |
| Safety & Emergency | 30559-30564 | 6 |
| Verification | 30595-30599 | 5 |
| Financial | 30513-30516 | 4 |
| Operational | 30565-30569 | 5 |
| UX Features | 30570-30577 | 8 |
| Compliance | 30540-30543 | 4 |
| Edge Cases | 30520, 30544-30545, 30553-30556 | 7 |
| Scheduled Rides | 30529-30531 | 3 |
| Carpooling & Multi-Leg | 30532-30535 | 4 |
| Surge & Dynamic Pricing | 30590-30592 | 3 |
| Driver Management | 30578-30582 | 5 |
| Navigation | 30583-30587 | 5 |
| Delivery | 30546-30548 | 3 |
| History & Reporting | 30593-30594 | 2 |
| Abuse Detection | 30549-30551 | 3 |
| Accessibility | 30552, 30588-30589 | 3 |
| **TOTAL** | **30500-30599** | **82** |

---

## Key Patterns

### Replaceable Events (NIP-33)
Most events are **replaceable** - new event replaces old one:
- Status updates (driver online, ride status)
- User preferences (saved locations, ride preferences)
- Verification documents (background checks, insurance)
- Aggregated data (reputation summary, earnings summary)

**Identified by**: `d` tag (unique identifier per pubkey)

### Append-Only Events
Some events must be **append-only** (non-replaceable):
- Ratings and reviews (historical record)
- Dispute filings and resolutions (audit trail)
- Emergency alerts (cannot be deleted)
- Payment records (tax/legal compliance)
- Theft reports (fraud detection)

---

## Common Tags Reference

| Tag | Description | Example |
|-----|-------------|---------|
| `d` | Unique identifier (NIP-33 parameterized replaceable) | `["d", "ride_abc123"]` |
| `ride_id` | Reference to specific ride | `["ride_id", "ride_abc123"]` |
| `driver_pubkey` | Driver's Nostr pubkey | `["driver_pubkey", "<hex>"]` |
| `rider_pubkey` | Rider's Nostr pubkey | `["rider_pubkey", "<hex>"]` |
| `operator_pubkey` | Operator's Nostr pubkey | `["operator_pubkey", "<hex>"]` |
| `pickup_lat` | Pickup latitude | `["pickup_lat", "40.7589"]` |
| `pickup_lon` | Pickup longitude | `["pickup_lon", "-73.9851"]` |
| `dropoff_lat` | Dropoff latitude | `["dropoff_lat", "40.7614"]` |
| `dropoff_lon` | Dropoff longitude | `["dropoff_lon", "-73.9776"]` |
| `fare_sats` | Fare in satoshis | `["fare_sats", "50000"]` |
| `payment_hash` | Lightning payment hash | `["payment_hash", "<hex>"]` |
| `geohash` | Geohash for location (privacy) | `["geohash", "dr5ru"]` |
| `timestamp` | Unix timestamp | `["timestamp", "1698765432"]` |
| `expiry` | Event expiration time | `["expiry", "1698769032"]` |
| `e` | Reference to another event | `["e", "<event-id>", "<relay-url>"]` |
| `p` | Reference to pubkey | `["p", "<pubkey>"]` |

---

## Usage Examples

### Find All Rides for a User
```javascript
// Query for all rides where user is rider
const rides = await relay.query({
  kinds: [30500], // Ride Request
  authors: [userPubkey]
});
```

### Get Driver's Current Status
```javascript
// Query for latest driver online status
const status = await relay.query({
  kinds: [30503], // Driver Online Status
  authors: [driverPubkey],
  limit: 1
});
```

### Monitor Emergency Alerts
```javascript
// Subscribe to emergency alerts in real-time
relay.subscribe({
  kinds: [30559], // Emergency Alert
  '#operator_pubkey': [operatorPubkey]
}, (event) => {
  handleEmergency(event);
});
```

### Get Reputation Summary
```javascript
// Get aggregated reputation for user
const reputation = await relay.query({
  kinds: [30519], // Reputation Summary
  authors: [userPubkey],
  limit: 1
});
```

---

## Implementation Notes

### Required Events (Minimum Viable Operator)
To launch a basic DonkeyRide operator, implement **at minimum**:

**Core**: 30500-30512 (ride lifecycle, payments)
**Trust**: 30517-30519 (ratings, reputation)
**Safety**: 30559 (emergency alert)
**Verification**: 30595-30596 (background checks, insurance)

**Total**: ~20 event kinds for MVP

### Optional Events (Enhanced Features)
Add these for feature parity with Uber/Lyft:

**Safety**: 30560-30564 (trip sharing, check-ins, harassment reports)
**Financial**: 30513-30516 (tips, wait time, no-show fees)
**UX**: 30570-30577 (preferences, lost & found, split payment)
**Advanced**: 30529-30535, 30583-30587 (scheduled, carpool, navigation)

### Future Extensions
These are optional / future enhancements:

**Cross-Operator**: 30505 (multi-operator coordination)
**Delivery**: 30546-30548 (package delivery)
**Surge**: 30590-30592 (dynamic pricing transparency)

---

## Additional Resources

- **Full Specification**: [NIP-XX-ridesharing.md](./NIP-XX-ridesharing.md)
- **FAQ**: [FAQ.md](./FAQ.md)
- **Platform Comparison**: [PLATFORM-COMPARISON.md](./PLATFORM-COMPARISON.md)
- **Architecture**: [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Quick Start**: [QUICK-START.md](./QUICK-START.md)

---

**Protocol Version**: v1.0
**Last Updated**: 2025-10-16
**Total Event Kinds**: 82 (30500-30599)
