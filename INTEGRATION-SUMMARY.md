# DonkeyRide Integration Summary

## Features to Integrate from index.html

### 1. Escrow/Stake System

**Rider Side:**
- Rider stakes 10% of fare when requesting ride
- Stake locked from balance
- Stake returned on successful completion
- Partial forfeit on rider cancellation

**Driver Side:**
- Driver stakes 15% of fare when accepting ride
- Stake locked from balance
- Stake returned on successful completion
- Partial forfeit (80%) on driver cancellation

**Implementation:**
```javascript
// Rider stakes 10%
const riderStake = Math.floor(fareAmount * 0.1);

// Driver stakes 15%
const driverStake = Math.floor(fareAmount * 0.15);

// On completion - release stakes
releaseStake(rideId, 'rider', riderStake);
releaseStake(rideId, 'driver', driverStake);

// On cancellation - partial forfeit
forfeitStake(rideId, 'driver', Math.floor(driverStake * 0.8));
```

### 2. Balance Tracking

**Initial Balances:**
- Rider: 10,000 sats
- Driver: 25,000 sats

**Operations:**
- Deduct stake when locking
- Return stake when releasing
- Transfer tips rider → driver
- Track total earned per session

**UI Updates:**
```javascript
function updateBalance(type, amount) {
    const element = document.getElementById(`${type}Balance`);
    const current = parseInt(element.textContent.replace(/,/g, ''));
    element.textContent = (current + amount).toLocaleString() + ' sats';
}
```

### 3. Ratings System

**After Ride Completion:**
- 5-star rating (1-5 stars)
- Click to select rating
- Required before completing ride
- Stored with ride data

**Implementation:**
```javascript
let selectedRating = 0;

function selectRating(stars) {
    selectedRating = stars;
    // Update UI to show selected stars
    for (let i = 1; i <= 5; i++) {
        const star = document.getElementById(`star-${i}`);
        star.textContent = i <= stars ? '★' : '☆';
    }
}
```

### 4. Tips Functionality

**Quick Tip Buttons:**
- 50 sats
- 100 sats
- 200 sats
- Custom amount input

**Implementation:**
```javascript
let tipAmount = 0;

function selectTip(amount) {
    tipAmount = amount;
    // Visual feedback
    highlightSelectedTip(amount);
}

function submitTip() {
    if (tipAmount > 0) {
        // Transfer from rider to driver
        updateBalance('rider', -tipAmount);
        updateBalance('driver', tipAmount);
    }
}
```

### 5. Online/Offline Status (Driver)

**Toggle Functionality:**
- Button to go online/offline
- Online = available for rides
- Offline = hidden from riders
- Visual indicator on UI

**Implementation:**
```javascript
let isOnline = false;

function toggleOnline() {
    isOnline = !isOnline;
    const btn = document.getElementById('onlineBtn');
    btn.textContent = isOnline ? 'Go Offline' : 'Go Online';
    btn.classList.toggle('online', isOnline);

    if (isOnline) {
        startListeningForRides();
    } else {
        stopListeningForRides();
    }
}
```

### 6. Backend API Integration

**Endpoints to Integrate:**

```javascript
// Calculate route with navigation
POST /navigation/calculate
{
    rideId, origin, destination, fareAmount
}

// Lock stakes (escrow)
POST /rides/lock-stakes
{
    rideId, riderStake, driverStake
}

// Complete ride & release stakes
POST /rides/complete
{
    rideId, rating, tip
}

// Submit rating
POST /rides/rate
{
    rideId, rating, comment
}

// Cancel ride
POST /rides/cancel
{
    rideId, cancelledBy
}
```

### 7. Payment Flow

**Complete Flow:**

1. **Rider Requests Ride**
   - Calculate fare from OSRM route
   - Calculate 10% stake
   - Lock rider stake
   - Broadcast request

2. **Driver Accepts**
   - Calculate 15% stake
   - Lock driver stake
   - Start navigation

3. **Ride In Progress**
   - Real-time GPS tracking
   - ETA updates
   - Turn-by-turn navigation

4. **Ride Complete**
   - Show rating UI
   - Show tip UI
   - Submit rating + tip
   - Release both stakes
   - Update balances

5. **Cancel Scenarios**
   - Rider cancel = forfeit full stake
   - Driver cancel = forfeit 80% of stake
   - Release other party's stake

## File Structure

### rider.html
- Balance display (top right)
- Stake indicator (when locked)
- Route selection with fare breakdown
- Real-time driver tracking
- Rating UI (post-ride)
- Tip UI (post-ride)
- Payment status

### driver.html
- Balance display (top right)
- Online/Offline toggle
- Earnings tracker
- Stake indicator (when locked)
- Route options with profit analysis
- Turn-by-turn navigation
- Rating received display

## Next Steps

1. ✅ Create INTEGRATION-SUMMARY.md (this file)
2. ⏳ Update rider.html with all features
3. ⏳ Update driver.html with all features
4. ⏳ Test complete flow
5. ⏳ Connect to real backend APIs

## Demo Flow

**Presentation Demo (5 minutes):**

1. **Open driver.html** (0:30)
   - Show offline status
   - Click "Go Online"
   - Show balance: 25,000 sats

2. **Open rider.html** (0:30)
   - Show balance: 10,000 sats
   - Enter pickup/dropoff
   - Click "Get Fare Estimate"

3. **Show OSRM Routes** (1:00)
   - Multiple route options
   - Real road-based routing
   - Fare breakdown
   - Profit analysis (driver view)

4. **Request Ride** (0:30)
   - Rider stakes 10% (shown)
   - Driver receives request
   - Driver sees required stake (15%)

5. **Accept & Navigate** (1:30)
   - Driver accepts
   - Both stakes locked
   - Real-time navigation starts
   - Car follows actual roads
   - Turn-by-turn instructions

6. **Track Progress** (0:30)
   - Real-time position updates
   - ETA updates
   - Distance remaining
   - Progress percentage

7. **Complete Ride** (0:30)
   - Arrive at destination
   - Rating UI appears
   - Select 5 stars
   - Add 100 sat tip

8. **Show Results** (0:30)
   - Stakes released
   - Tip transferred
   - Final balances shown
   - Earnings summary

**Total: 5 minutes 30 seconds**

## Technical Notes

- All routing uses real OSRM data
- Stakes managed by backend (demo mode uses mock)
- Ratings stored in Nostr events (kind 30555)
- Tips processed via Lightning (demo mode mocks)
- GPS tracking uses browser geolocation API
- WebSocket for real-time updates

## Security Considerations

- NIP-98 authentication required
- Rate limiting on API endpoints
- Stake amounts verified server-side
- Lightning invoices validated
- No client-side balance manipulation
- All transactions logged to Nostr
