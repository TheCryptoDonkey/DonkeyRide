# DonkeyRide React Apps Plan

**Mobile**: React Native (iOS + Android from one codebase)
**Web**: React (demo interface, admin panel)

---

## Architecture

```
/DonkeyRide/
├── backend/                  # Operator backend (Express)
│   ├── server.js
│   ├── src/
│   └── ...
│
├── mobile/                   # React Native (Rider + Driver)
│   ├── package.json
│   ├── App.tsx
│   ├── src/
│   │   ├── screens/
│   │   │   ├── rider/
│   │   │   │   ├── HomeScreen.tsx
│   │   │   │   ├── RequestRideScreen.tsx
│   │   │   │   ├── ActiveRideScreen.tsx
│   │   │   │   └── RatingScreen.tsx
│   │   │   └── driver/
│   │   │       ├── DashboardScreen.tsx
│   │   │       ├── IncomingRideScreen.tsx
│   │   │       ├── ActiveRideScreen.tsx
│   │   │       └── EarningsScreen.tsx
│   │   ├── components/
│   │   ├── services/
│   │   │   ├── NostrService.ts
│   │   │   ├── LightningService.ts
│   │   │   └── LocationService.ts
│   │   └── utils/
│   └── ...
│
└── web/                      # React Web (Demo + Admin)
    ├── package.json
    ├── public/
    ├── src/
    │   ├── pages/
    │   │   ├── DemoPage.tsx
    │   │   ├── AdminDashboard.tsx
    │   │   └── OperatorStats.tsx
    │   ├── components/
    │   └── services/
    └── ...
```

---

## React Native Mobile Apps

### Technology Stack

**Core**:
- React Native 0.72+
- TypeScript
- React Navigation 6
- React Native Maps

**Nostr**:
- nostr-tools
- WebSocket support

**Lightning**:
- react-native-lightning (if available)
- Or WebLN bridge

**State Management**:
- React Context + Hooks (simple)
- Or Zustand (if needed)

**Maps**:
- react-native-maps
- @react-native-community/geolocation

**UI**:
- React Native Paper (Material Design)
- Or NativeBase
- Or custom components

### App 1: Rider App

**Screens** (5 main):

1. **HomeScreen**
   - Map showing current location
   - "Where to?" search bar
   - Saved locations (home, work)
   - Recent trips

2. **RequestRideScreen**
   - Select pickup location
   - Select dropoff location
   - See cost estimate (sats + fiat)
   - Currency toggle (USD/EUR/GBP)
   - "Request Ride" button

3. **WaitingScreen**
   - "Finding driver..." animation
   - Cancel button
   - Nearby drivers shown on map

4. **ActiveRideScreen**
   - Driver info (name, photo, rating)
   - Real-time driver location
   - ETA to pickup
   - ETA to destination
   - Route on map
   - Trip cost
   - Emergency button
   - Share trip button

5. **CompletedScreen**
   - Trip summary
   - Final cost (sats + fiat)
   - Rate driver (1-5 stars)
   - Add tip option
   - Receipt

**Key Features**:
- ✅ Real-time location tracking
- ✅ WebSocket connection for updates
- ✅ Nostr integration for ride requests
- ✅ Lightning payments (mock for now)
- ✅ Dual pricing display (sats + fiat)
- ✅ Push notifications
- ✅ Trip history
- ✅ Saved locations

---

### App 2: Driver App

**Screens** (5 main):

1. **DashboardScreen**
   - Online/Offline toggle (big button)
   - Today's earnings (sats + fiat)
   - Rides completed today
   - Average rating
   - Map showing current location

2. **IncomingRideScreen**
   - Ride request notification
   - Pickup location
   - Dropoff location
   - Estimated fare
   - Distance to pickup
   - Accept/Decline buttons (15 second timer)

3. **EnRoutePickupScreen**
   - Rider info (name, rating)
   - Pickup location
   - Navigation to pickup
   - ETA
   - Call rider button
   - Cancel ride button

4. **ActiveRideScreen**
   - Rider info
   - Dropoff location
   - Navigation to dropoff
   - ETA
   - Meter running (real-time fare)
   - Complete ride button

5. **EarningsScreen**
   - Today's earnings breakdown
   - Weekly earnings
   - Monthly earnings
   - Ride history
   - Payment history
   - Withdrawals (Lightning)

**Key Features**:
- ✅ Go online/offline
- ✅ Receive ride requests (push notifications)
- ✅ Accept/decline rides
- ✅ Turn-by-turn navigation
- ✅ Real-time fare tracking
- ✅ Instant Lightning payouts
- ✅ Earnings dashboard
- ✅ Ride history

---

## React Web App

### Purpose
- Demo interface (like demo.html but in React)
- Admin dashboard for operators
- Stats and monitoring

### Technology Stack

**Core**:
- React 18
- TypeScript
- Vite (fast builds)

**Maps**:
- Leaflet (react-leaflet)
- Or Mapbox GL JS

**Charts**:
- Recharts
- Or Chart.js

**UI**:
- Tailwind CSS
- Or Material-UI

**State**:
- React Context
- Or Zustand

### Pages

1. **Demo Page** (public)
   - Live map with drivers
   - Trip planner
   - Cost estimator
   - Dual pricing

2. **Operator Dashboard** (private)
   - Active rides count
   - Revenue today
   - Driver count (online/offline)
   - Live map of all rides
   - Alerts

3. **Stats Page** (private)
   - Revenue charts
   - Ride volume charts
   - Driver performance
   - User growth
   - Geographic heatmaps

---

## Setup Commands

### React Native Mobile

```bash
# 1. Create React Native project
npx react-native init DonkeyRideMobile --template react-native-template-typescript

cd DonkeyRideMobile

# 2. Install dependencies
npm install @react-navigation/native @react-navigation/stack
npm install react-native-screens react-native-safe-area-context
npm install react-native-maps @react-native-community/geolocation
npm install nostr-tools websocket-polyfill
npm install react-native-paper
npm install @react-native-async-storage/async-storage

# 3. iOS setup
cd ios && pod install && cd ..

# 4. Run on iOS
npx react-native run-ios

# 5. Run on Android
npx react-native run-android
```

### React Web

```bash
# 1. Create React project with Vite
npm create vite@latest donkeyride-web -- --template react-ts

cd donkeyride-web

# 2. Install dependencies
npm install
npm install react-router-dom
npm install react-leaflet leaflet
npm install recharts
npm install tailwindcss postcss autoprefixer
npm install nostr-tools

# 3. Setup Tailwind
npx tailwindcss init -p

# 4. Run dev server
npm run dev
```

---

## Shared Code

Create shared TypeScript package for common code:

```bash
# /DonkeyRide/shared/

mkdir shared
cd shared
npm init -y

# Add common code:
# - Nostr client
# - Type definitions
# - Pricing utilities
# - Constants
```

**Usage**:
```typescript
// In mobile app
import { NostrClient } from '../../../shared/src/nostr';

// In web app
import { NostrClient } from '../../shared/src/nostr';
```

---

## Development Flow

### Phase 1: Setup (Day 1)

1. Create React Native project
2. Create React Web project
3. Setup navigation (React Navigation)
4. Setup maps (react-native-maps)
5. Create basic screen structure

### Phase 2: Core Features (Days 2-7)

**Rider App**:
- Day 2: Home screen with map
- Day 3: Request ride flow
- Day 4: Active ride tracking
- Day 5: Payment integration
- Day 6: Rating and history
- Day 7: Polish and test

**Driver App**:
- Day 8: Dashboard and online toggle
- Day 9: Incoming ride requests
- Day 10: Navigation to pickup
- Day 11: Active ride with navigation
- Day 12: Earnings and history
- Day 13: Polish and test

**Web App**:
- Day 14: Demo page with live map
- Day 15: Admin dashboard
- Day 16: Stats and charts

---

## Key Components to Build

### Mobile Components

```
src/components/
├── Map/
│   ├── MapView.tsx           # Base map component
│   ├── DriverMarker.tsx      # Driver marker on map
│   ├── RoutePolyline.tsx     # Route line
│   └── LocationMarker.tsx    # Pickup/dropoff markers
│
├── Ride/
│   ├── RideCard.tsx          # Ride info card
│   ├── CostEstimate.tsx      # Cost breakdown
│   ├── DualPrice.tsx         # Sats + Fiat display
│   └── DriverInfo.tsx        # Driver details
│
├── Payment/
│   ├── LightningInvoice.tsx  # Invoice display
│   ├── PaymentStatus.tsx     # Payment progress
│   └── TipSelector.tsx       # Tip amount selector
│
└── Common/
    ├── Button.tsx
    ├── Input.tsx
    ├── Card.tsx
    └── Loading.tsx
```

### Services

```typescript
// NostrService.ts
class NostrService {
  constructor(relays: string[], privateKey: string);
  publish(event: NostrEvent): Promise<void>;
  subscribe(filters: Filter[], callback: (event: NostrEvent) => void);
  requestRide(pickup, dropoff, fare): Promise<string>; // returns ride_id
  acceptRide(ride_id, driver_pubkey): Promise<void>;
}

// LocationService.ts
class LocationService {
  getCurrentLocation(): Promise<{lat, lon}>;
  watchLocation(callback: (location) => void): void;
  calculateDistance(point1, point2): number;
  calculateETA(from, to): Promise<number>;
}

// LightningService.ts
class LightningService {
  constructor(provider: 'mock' | 'lnd' | 'strike');
  createInvoice(amount_sats, memo): Promise<string>;
  payInvoice(invoice): Promise<boolean>;
  checkPayment(payment_hash): Promise<PaymentStatus>;
}

// PricingService.ts
class PricingService {
  estimateCost(distance, duration, currency): Promise<CostEstimate>;
  satsToFiat(sats, currency): Promise<number>;
  fiatToSats(amount, currency): Promise<number>;
  formatDualPrice(sats, currency): string;
}
```

---

## Example Screens

### Rider: HomeScreen.tsx

```typescript
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useLocation } from '../hooks/useLocation';

export function HomeScreen({ navigation }) {
  const { location, loading } = useLocation();
  const [drivers, setDrivers] = useState([]);

  useEffect(() => {
    // Fetch nearby drivers
    fetchDrivers();
  }, [location]);

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        region={{
          latitude: location?.lat || 40.7580,
          longitude: location?.lon || -73.9855,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05
        }}
      >
        {/* Current location */}
        {location && (
          <Marker coordinate={location} title="You" />
        )}

        {/* Drivers */}
        {drivers.map(driver => (
          <Marker
            key={driver.npub}
            coordinate={driver.location}
            title={driver.name}
          />
        ))}
      </MapView>

      <View style={styles.searchBar}>
        <Text onPress={() => navigation.navigate('RequestRide')}>
          Where to?
        </Text>
      </View>
    </View>
  );
}
```

---

## Testing Strategy

### Unit Tests
- Service layer (Nostr, Lightning, Location)
- Utility functions (pricing, formatting)
- Components (isolated)

### Integration Tests
- Full ride flow (request → accept → complete)
- Payment flow (stake → fare → payout)
- Real-time updates (WebSocket)

### E2E Tests
- Mobile: Detox
- Web: Cypress

---

## Deployment

### Mobile
- iOS: TestFlight (beta), App Store (production)
- Android: Google Play Internal Testing (beta), Play Store (production)

### Web
- Vercel or Netlify (static hosting)
- Or serve from backend (Express static)

---

## Timeline

**Week 1**: Setup + Core Backend
**Week 2**: Payments
**Week 3**: Real-Time
**Week 4**: Rider App (React Native)
**Week 5**: Driver App (React Native)
**Week 6**: Web App (React)
**Week 7**: Testing
**Week 8**: Polish + Deploy

---

## Next Immediate Steps

**Right now** (before React apps):

1. ✅ Test environment setup (done)
2. ⏳ Add backend API endpoints (15 min)
3. ⏳ Test demo.html (works!)
4. ⏳ Start Phase 1 backend work

**Then** (Week 4):

1. Create React Native project
2. Setup navigation
3. Build Rider app screens
4. Connect to backend
5. Test on real devices

---

**Want to start with the React Native setup now, or finish the backend APIs first?**

I recommend:
1. Finish backend APIs (15 min)
2. Test demo.html works
3. Then start React Native apps with working backend
