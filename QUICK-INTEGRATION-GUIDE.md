# Quick Integration Guide

## Changes Needed to Existing Pages

### rider.html - Key Additions

**1. Add Balance Display to Header** (after line 256)
```html
<div class="header">
    <div>
        <h1>🚗 DonkeyRide</h1>
        <p>Smart routing for cheaper, faster rides</p>
    </div>
    <div style="text-align: right;">
        <div style="font-size: 0.9em; color: rgba(255,255,255,0.8);">Balance</div>
        <div style="font-size: 1.3em; font-weight: bold;" id="riderBalance">10,000 sats</div>
        <div id="riderStake" style="display: none; font-size: 0.8em; color: #ffcc00; margin-top: 5px;">
            🔒 Staked: <span id="riderStakeAmount">0</span> sats
        </div>
    </div>
</div>
```

**2. Update getEstimate() function** - Add stake calculation
```javascript
async function getEstimate() {
    // ... existing code ...

    // After parsing routes, calculate and show stake
    if (currentRoutes && currentRoutes.length > 0) {
        const fare = currentRoutes[0].route.fare;
        const stake = Math.floor(fare * 0.1); // 10% stake

        // Show stake info in UI
        document.getElementById('riderStake').style.display = 'block';
        document.getElementById('riderStakeAmount').textContent = stake;

        // Lock stake from balance
        const balance = parseInt(document.getElementById('riderBalance').textContent.replace(/,/g, ''));
        document.getElementById('riderBalance').textContent = (balance - stake).toLocaleString() + ' sats';
    }
}
```

**3. Add Rating UI Section** (after complete-section)
```html
<div class="sidebar-section" id="rating-section" style="display: none;">
    <h3>⭐ Rate Your Ride</h3>

    <div style="text-align: center; margin: 20px 0;">
        <div style="font-size: 3em; letter-spacing: 10px;" id="stars-container">
            <span class="star" onclick="selectRating(1)">☆</span>
            <span class="star" onclick="selectRating(2)">☆</span>
            <span class="star" onclick="selectRating(3)">☆</span>
            <span class="star" onclick="selectRating(4)">☆</span>
            <span class="star" onclick="selectRating(5)">☆</span>
        </div>
    </div>

    <h3 style="margin-top: 20px;">💵 Add a Tip?</h3>
    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 15px;">
        <button class="btn" style="padding: 10px;" onclick="selectTip(50)">50 sats</button>
        <button class="btn" style="padding: 10px;" onclick="selectTip(100)">100 sats</button>
        <button class="btn" style="padding: 10px;" onclick="selectTip(200)">200 sats</button>
    </div>
    <input type="number" id="customTip" placeholder="Custom tip amount"
           style="width: 100%; padding: 10px; margin-bottom: 15px;">

    <button class="btn" onclick="submitRatingAndTip()">Submit Rating & Tip</button>
</div>
```

**4. Add Rating/Tip Functions**
```javascript
let selectedRating = 0;
let tipAmount = 0;

function selectRating(stars) {
    selectedRating = stars;
    const container = document.getElementById('stars-container');
    const starElements = container.querySelectorAll('.star');
    starElements.forEach((star, index) => {
        star.textContent = index < stars ? '★' : '☆';
        star.style.color = index < stars ? '#ffd700' : '#666';
    });
}

function selectTip(amount) {
    tipAmount = amount;
    // Clear custom input
    document.getElementById('customTip').value = '';
    // Visual feedback
    console.log(`💵 Tip selected: ${amount} sats`);
}

function submitRatingAndTip() {
    const customTip = document.getElementById('customTip').value;
    if (customTip) {
        tipAmount = parseInt(customTip);
    }

    if (selectedRating === 0) {
        alert('Please select a rating');
        return;
    }

    // Process tip
    if (tipAmount > 0) {
        const balance = parseInt(document.getElementById('riderBalance').textContent.replace(/,/g, ''));
        document.getElementById('riderBalance').textContent = (balance - tipAmount).toLocaleString() + ' sats';
    }

    // Release stake
    const stake = parseInt(document.getElementById('riderStakeAmount').textContent);
    const balance = parseInt(document.getElementById('riderBalance').textContent.replace(/,/g, ''));
    document.getElementById('riderBalance').textContent = (balance + stake).toLocaleString() + ' sats';
    document.getElementById('riderStake').style.display = 'none';

    // Show completion
    alert(`Thank you! Rating: ${selectedRating}★ ${tipAmount > 0 ? `| Tip: ${tipAmount} sats` : ''}`);

    // Reset for new ride
    setTimeout(newRide, 2000);
}
```

**5. Update rideComplete() function**
```javascript
function rideComplete() {
    console.log('🎉 Ride complete!');

    // Hide tracking, show rating
    document.getElementById('matched-section').style.display = 'none';
    document.getElementById('rating-section').style.display = 'block';
}
```

### driver.html - Key Additions

**1. Add Balance & Online Status to Header**
```html
<div class="header">
    <h1>🚗 DonkeyRide Driver</h1>
    <div style="display: flex; gap: 15px; align-items: center;">
        <div style="text-align: right;">
            <div style="font-size: 0.9em; opacity: 0.9;">Balance</div>
            <div style="font-size: 1.2em; font-weight: bold;" id="driverBalance">25,000 sats</div>
            <div id="driverStake" style="display: none; font-size: 0.8em; color: #ffcc00;">
                🔒 Staked: <span id="driverStakeAmount">0</span> sats
            </div>
        </div>
        <button class="status-badge" id="online-toggle" onclick="toggleOnline()">Go Online</button>
    </div>
</div>
```

**2. Add toggleOnline() function**
```javascript
let isOnline = false;

function toggleOnline() {
    isOnline = !isOnline;
    const btn = document.getElementById('online-toggle');

    if (isOnline) {
        btn.textContent = 'ONLINE';
        btn.classList.add('online');
        btn.style.background = '#00ff00';
        btn.style.color = '#000';
        document.getElementById('waiting-section').querySelector('.empty-state p').textContent =
            'Online and ready to accept rides';

        // Start simulating ride requests
        setTimeout(simulateRideRequest, 2000);
    } else {
        btn.textContent = 'Go Online';
        btn.classList.remove('online');
        btn.style.background = '#888';
        btn.style.color = '#fff';
        document.getElementById('waiting-section').querySelector('.empty-state p').textContent =
            'Click "Go Online" to start receiving rides';
    }
}
```

**3. Update acceptRide() - Lock Driver Stake**
```javascript
async function acceptRide() {
    const fare = currentRideRequest.fare;
    const driverStake = Math.floor(fare * 0.15); // 15% stake

    // Lock stake
    const balance = parseInt(document.getElementById('driverBalance').textContent.replace(/,/g, ''));
    document.getElementById('driverBalance').textContent = (balance - driverStake).toLocaleString() + ' sats';

    // Show stake indicator
    document.getElementById('driverStake').style.display = 'block';
    document.getElementById('driverStakeAmount').textContent = driverStake;

    // Continue with normal flow
    await calculateRoutes();
}
```

**4. Update completeRide() - Release Stake & Show Earnings**
```javascript
function completeRide() {
    console.log('✅ Ride completed!');

    if (navUpdateInterval) {
        clearInterval(navUpdateInterval);
    }

    // Release stake
    const stake = parseInt(document.getElementById('driverStakeAmount').textContent);
    let balance = parseInt(document.getElementById('driverBalance').textContent.replace(/,/g, ''));
    balance += stake; // Return stake

    // Add earnings
    const earnings = parseFloat(selectedRoute.analysis.netProfit);
    balance += Math.round(earnings * 100); // Convert £ to sats estimate

    document.getElementById('driverBalance').textContent = balance.toLocaleString() + ' sats';
    document.getElementById('driverStake').style.display = 'none';

    // Update earnings tracker
    todayEarnings.total += earnings;
    todayEarnings.rides++;
    updateEarnings();

    // Show completion message
    alert(`Ride complete! Earned: ${earnings.toFixed(2)} (£${earnings.toFixed(2)})`);

    // Reset for next ride
    document.getElementById('active-ride-section').style.display = 'none';
    document.getElementById('nav-section').style.display = 'none';
    document.getElementById('waiting-section').style.display = 'block';

    if (markers.driver) map.removeLayer(markers.driver);
    if (markers.pickup) map.removeLayer(markers.pickup);
    if (markers.dropoff) map.removeLayer(markers.dropoff);
    routeLines.forEach(line => map.removeLayer(line));

    selectedRoute = null;
    currentRideRequest = null;

    // Get another request if online
    if (isOnline) {
        setTimeout(simulateRideRequest, 3000);
    }
}
```

## Testing Checklist

### Rider Flow
- [ ] Balance displays correctly (10,000 sats)
- [ ] Stake locks when requesting ride (10% of fare)
- [ ] Route options show with fare breakdown
- [ ] Real OSRM routing works
- [ ] Driver tracking updates in real-time
- [ ] Ride completes and shows rating UI
- [ ] Rating selection works (1-5 stars)
- [ ] Tip buttons work (50, 100, 200, custom)
- [ ] Stake releases after rating
- [ ] Tip deducts from balance
- [ ] Can request new ride after completion

### Driver Flow
- [ ] Balance displays correctly (25,000 sats)
- [ ] Online/Offline toggle works
- [ ] Ride requests appear when online
- [ ] Stake requirement shown (15% of fare)
- [ ] Stake locks when accepting ride
- [ ] Route options show profit analysis
- [ ] Real OSRM routing works
- [ ] Turn-by-turn navigation works
- [ ] Position updates smoothly
- [ ] Ride completion releases stake
- [ ] Earnings added to balance
- [ ] Today's earnings tracker updates
- [ ] Can accept new rides when online

### Integration
- [ ] Server running on :3000
- [ ] Both pages can open simultaneously
- [ ] OSRM API accessible
- [ ] No console errors
- [ ] Smooth animations
- [ ] Mobile responsive (bonus)

## Quick Demo Script

1. Open driver.html → Go Online (0:10)
2. Open rider.html → Request ride Trafalgar→Tower Bridge (0:20)
3. Driver accepts → Both stakes lock (0:10)
4. Watch navigation → Real roads, turn-by-turn (1:00)
5. Complete ride → Rate 5★, tip 100 sats (0:20)
6. Show final balances (0:10)

**Total: 2 minutes 10 seconds**

## Files Modified

1. `rider.html` - Balance, stakes, rating, tips
2. `driver.html` - Balance, online toggle, stakes, earnings
3. Both pages already have OSRM integration ✅

## No Backend Changes Needed

The demo works entirely client-side with:
- Real OSRM routing
- Simulated payment flows
- Mock stake locking
- Client-side balance tracking

For production, connect to `/api` endpoints in server.js.
