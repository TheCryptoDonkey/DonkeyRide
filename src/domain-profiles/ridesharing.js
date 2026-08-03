/**
 * Ridesharing Domain Profile
 *
 * The default domain profile, matching the original DonkeyRide protocol.
 * Geospatial discovery, distance+time pricing, GPS trace completion proof.
 */

const profile = {
  id: 'ridesharing',
  name: 'DonkeyRide',
  description: 'Peer-to-peer ridesharing coordination with real-time tracking and direct rider-to-driver settlement.',

  discoveryMethod: 'geohash',
  pricingModel: 'distance_time_surge',

  states: {
    values: {
      REQUESTED: 'requested',
      MATCHED: 'matched',
      PROVIDER_EN_ROUTE: 'en_route',
      PROVIDER_ARRIVED: 'arrived',
      ACTIVE: 'active',
      COMPLETED: 'completed',
      CANCELLED: 'cancelled',
      NO_SHOW: 'no_show'
    },
    transitions: {
      'requested': ['matched', 'cancelled'],
      'matched': ['en_route', 'cancelled'],
      'en_route': ['arrived', 'cancelled'],
      'arrived': ['active', 'no_show', 'cancelled'],
      'active': ['completed', 'cancelled']
    },
    terminal: ['completed', 'no_show', 'cancelled'],
    initial: 'requested'
  },

  roles: {
    requester: 'rider',
    provider: 'driver'
  },

  labels: {
    originLabel: 'Pickup',
    destinationLabel: 'Dropoff',
    taskNoun: 'ride',
    requestVerb: 'Request',
    activeVerb: 'In transit',
    completedLabel: 'Ride Complete',
    originInstruction: 'Tap the map to set your pickup location',
    destinationInstruction: 'Now tap to set your destination',
  },

  stakingModel: {
    requesterStakePercent: 0.10,
    providerStakePercent: 0.15,
    penaltyPercent: 0.80
  },

  completionProofTypes: ['gps_trace'],
  disputeEvidenceTypes: ['text', 'photo', 'gps_trace'],

  ratingCriteria: [
    { tag: 'overall', label: 'Overall', weight: 0.4 },
    { tag: 'punctuality', label: 'Punctuality', weight: 0.2 },
    { tag: 'safety', label: 'Safety', weight: 0.2 },
    { tag: 'courtesy', label: 'Courtesy', weight: 0.2 }
  ],

  dataRetention: {
    taskData: 90,
    locationData: 30,
    paymentData: 2555
  },

  encryptionRequired: false,
  regulatoryBodies: {},

  features: {
    navigation: true,
    liveTracking: true,
    tipping: true,
    safetyAlerts: true,
    photos: false,
    signatures: false,
    quoteNegotiation: false,
    guaranteePeriod: false,
    requiresDestination: true
  },

  // Service classes. The whole rate card is scaled by fareMultiplier, so
  // the breakdown always sums to the quoted fare. `seats` is what a driver
  // must be able to seat to serve the class — a driver only receives jobs
  // for classes their vehicle can actually take.
  serviceOptions: [
    {
      id: 'standard',
      label: 'Standard',
      description: 'Everyday car, up to 4 seats',
      fareMultiplier: 1,
      seats: 4
    },
    {
      id: 'comfort',
      label: 'Comfort',
      description: 'Newer, roomier car',
      fareMultiplier: 1.3,
      seats: 4
    },
    {
      id: 'xl',
      label: 'XL',
      description: 'Up to 6 seats — luggage or a group',
      fareMultiplier: 1.6,
      seats: 6
    }
  ],

  theme: {
    primary: '#b24cf3',
    primaryRgb: '178, 76, 243',
    secondary: '#ff6ec7',
    secondaryRgb: '255, 110, 199',
    accent: '#00ff88',
    accentRgb: '0, 255, 136',
    gradientFrom: '#b24cf3',
    gradientTo: '#ff6ec7',
    gradientAngle: '135deg',
    routeColour: '#b24cf3',
    emoji: '🚗',
  },
};

module.exports = profile;
