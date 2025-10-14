# Scheduled Rides Demo Script

## Key Improvements from Feedback

### 1. Realistic Streaming Intervals
- **OLD**: Payment every 3 seconds = 400+ invoices for a 20-min ride 😱
- **NEW**: Payment every 30 seconds = ~40 invoices for a 20-min ride ✅
- **Why**: Reduces Lightning fees and network overhead while maintaining trust

### 2. Sensible Expiry Times
- **Immediate rides**: Expire after 30 minutes (not 24 hours!)
- **Scheduled rides**: Expire 1 hour before pickup time
- **Completed rides**: Archive after 7 days for disputes

### 3. Scheduled Ride Economics

#### The Problem
"You book an airport transfer for 5am. Driver accepts. At 4:55am they cancel. You miss your flight. With Uber, you complain and maybe get a $5 credit. Not good enough!"

#### The Solution
```javascript
// Scheduled Ride Stakes (Higher commitment)
{
  rider_stake: 20%,     // Double the normal stake
  driver_stake: 30%,    // Triple commitment from driver
  
  // Sliding scale penalties based on time
  cancellation_penalties: {
    "24h+": 20%,        // Minor inconvenience
    "12-24h": 50%,      // Need to find alternative
    "6-12h": 80%,       // Serious disruption
    "<6h": 100%,        // Critical failure
    "no_show": 200%     // Driver pays FULL RIDE VALUE
  }
}
```

## Demo Flow

### Part 1: Show the Problem
"Let me book an airport ride for tomorrow morning..."

```javascript
// Create scheduled ride
const airportRide = {
  from: "Hotel",
  to: "Manchester Airport",
  pickup_time: "2025-01-15 05:00",
  price: 2000,                    // sats
  rider_stake: 400,                // 20% locked now
  required_driver_stake: 600,     // 30% from driver
  importance: 9                    // Critical ride
};
```

### Part 2: Driver Acceptance
"Driver sees this is a scheduled ride with HIGH stakes..."

```javascript
// Driver must stake 600 sats to accept
// If they no-show, they lose 600 AND pay 2000 sats penalty
// Total risk: 2600 sats for breaking commitment
```

### Part 3: Cancellation Scenarios

#### Scenario A: Driver cancels 2 days before
- Driver loses: 120 sats (20% of stake)
- Rider gets: 120 sats compensation
- Impact: Minimal, plenty of time to rebook

#### Scenario B: Driver cancels 2 hours before
- Driver loses: 600 sats (100% of stake)
- Rider gets: 600 sats compensation
- Impact: Major disruption compensated

#### Scenario C: Driver no-shows
- Driver loses: 600 sats stake + 2000 sats penalty
- Rider gets: 2600 sats (more than ride cost!)
- Impact: Missed flight, but significant compensation

### Part 4: Why This Works

**Economic Alignment**:
- Scheduled rides are MORE valuable (people plan around them)
- Higher stakes reflect higher importance
- Penalties scale with disruption caused
- Driver thinks VERY carefully before accepting

**Compare to Uber**:
- Uber: "Sorry, driver cancelled. Here's $5 credit"
- NostrRide: "Driver paid you 2600 sats for the disruption"

## Technical Implementation

### Scheduled Ride Event
```json
{
  "kind": 30500,
  "tags": [
    ["ride_type", "scheduled"],
    ["pickup_time", "1736920800"],  // Unix timestamp
    ["schedule_weight", "9"],        // 1-10 importance
    ["rider_stake", "400"],          // 20% upfront
    ["requires_driver_stake", "600"], // 30% commitment
    ["expiry", "1736917200"]         // Expires 1h before pickup
  ],
  "content": "Airport transfer - Flight BA123 at 07:30"
}
```

### Streaming During Ride
```javascript
// Every 30 seconds, not 3!
setInterval(() => {
  streamPayment(50);  // 50 sats per interval
}, 30000);

// For 20-minute airport ride:
// - 40 payments of 50 sats
// - Total: 2000 sats
// - Driver sees earnings every 30 seconds
// - Not overwhelming with invoices
```

## Key Talking Points

### On Streaming Frequency
> "We initially had payments every 3 seconds - that's 400 invoices for a 20-minute ride! Lightning is cheap but not free. Every 30 seconds gives us the trust benefit without the invoice spam."

### On Expiry Times
> "Nobody waits 24 hours for a ride. Immediate rides expire in 30 minutes. If no driver accepts in that time, you're probably walking!"

### On Scheduled Rides
> "This is where traditional ridesharing fails most. They treat a 5am airport ride the same as a random Tuesday afternoon trip. We recognize that scheduled rides have different trust requirements."

### The Killer Line
> "In our system, if a driver accepts your airport ride and doesn't show, they pay YOU the full fare. Try getting that from Uber!"

## Demo Variations

### Business Travel
- Company books ride for employee
- Company stakes on behalf
- Higher stakes for reliability
- Automatic expense reporting via Nostr events

### Medical Appointments
- Tagged as high-importance
- Extended grace period for traffic
- But massive penalties for no-shows
- Could integrate with medical provider systems

### School Runs
- Recurring scheduled rides
- Same driver preference
- Reputation heavily weighted
- Parent notifications via Nostr

## FAQ Responses

**Q: "Why not just use upfront payment?"**
> "Because then drivers could take payment and not complete the ride. Streaming + stakes means both parties stay honest throughout."

**Q: "Isn't 30 seconds still frequent?"**
> "It's a balance. Every 5 minutes would allow too much gaming. Every 30 seconds means maximum 30 seconds of unpaid service. For a 20-minute ride, that's 40 invoices - totally manageable."

**Q: "What about network failures during streaming?"**
> "Payments can catch up when reconnected. The commitment stakes ensure neither party walks away. If there's a dispute, the stakes provide compensation."

## Closing

> "We've built a ridesharing protocol that handles everything from quick trips to critical airport transfers. No company needed, just code and economic incentives. 
> 
> The real innovation isn't the technology - it's recognizing that different rides have different trust requirements and building economics that reflect that.
> 
> Uber treats all rides the same and takes 25% regardless. We adapt the protocol to the ride's importance and take 0%. That's the power of protocols over platforms."