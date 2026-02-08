/**
 * Parcel Delivery Domain Profile
 *
 * Protocol fit: 9/10. Near-identical to ridesharing.
 * Pick up at A, deliver to B, track in real-time.
 * Replace "passenger" with "parcel".
 *
 * Adds COLLECTED state between ARRIVED and ACTIVE.
 * Proof of completion: geotagged photo + digital signature.
 */

const profile = {
  id: 'delivery',
  name: 'DonkeyPack',
  description: 'Peer-to-peer parcel delivery with real-time tracking, photo proof, and digital signatures.',

  discoveryMethod: 'geohash',
  pricingModel: 'distance_time_surge',

  states: {
    values: {
      REQUESTED: 'collection_requested',
      MATCHED: 'courier_matched',
      PROVIDER_EN_ROUTE: 'en_route_to_pickup',
      PROVIDER_ARRIVED: 'arrived_at_pickup',
      COLLECTED: 'collected',
      ACTIVE: 'in_transit',
      ARRIVED_AT_DELIVERY: 'arrived_at_delivery',
      COMPLETED: 'delivered',
      CANCELLED: 'cancelled'
    },
    transitions: {
      'collection_requested': ['courier_matched', 'cancelled'],
      'courier_matched': ['en_route_to_pickup', 'cancelled'],
      'en_route_to_pickup': ['arrived_at_pickup', 'cancelled'],
      'arrived_at_pickup': ['collected', 'cancelled'],
      'collected': ['in_transit', 'cancelled'],
      'in_transit': ['arrived_at_delivery', 'cancelled'],
      'arrived_at_delivery': ['delivered', 'cancelled']
    },
    terminal: ['delivered', 'cancelled'],
    initial: 'collection_requested'
  },

  roles: {
    requester: 'sender',
    provider: 'courier'
  },

  labels: {
    originLabel: 'Collection point',
    destinationLabel: 'Delivery address',
    taskNoun: 'delivery',
    requestVerb: 'Request collection',
    activeVerb: 'In transit',
    completedLabel: 'Delivered',
    originInstruction: 'Tap the map to set the collection point',
    destinationInstruction: 'Now tap to set the delivery address',
  },

  stakingModel: {
    requesterStakePercent: 0.10,
    providerStakePercent: 0.15,
    penaltyPercent: 0.80
  },

  completionProofTypes: ['gps_arrival', 'photo', 'signature'],
  disputeEvidenceTypes: ['text', 'photo', 'gps_trace', 'signature'],

  ratingCriteria: [
    { tag: 'overall', label: 'Overall', weight: 0.3 },
    { tag: 'punctuality', label: 'Punctuality', weight: 0.25 },
    { tag: 'care', label: 'Package care', weight: 0.25 },
    { tag: 'communication', label: 'Communication', weight: 0.2 }
  ],

  dataRetention: {
    taskData: 365,
    locationData: 90,
    paymentData: 2555
  },

  encryptionRequired: false,

  regulatoryBodies: {
    consumerRights: {
      name: 'Consumer Rights Act 2015',
      required: true,
      description: 'Goods-in-transit liability applies'
    }
  },

  features: {
    navigation: true,
    liveTracking: true,
    tipping: true,
    safetyAlerts: false,
    streaming: true,
    photos: true,
    signatures: true,
    quoteNegotiation: false,
    guaranteePeriod: false,
    requiresDestination: true
  },

  theme: {
    primary: '#0891b2',
    primaryRgb: '8, 145, 178',
    secondary: '#06b6d4',
    secondaryRgb: '6, 182, 212',
    accent: '#22d3ee',
    accentRgb: '34, 211, 238',
    gradientFrom: '#0891b2',
    gradientTo: '#06b6d4',
    gradientAngle: '135deg',
    routeColour: '#0891b2',
    emoji: '📦',
  },

  eventKinds: {
    request: 30500,
    acceptance: 30501,
    streamPayment: 30510,
    completion: 30511,
    statusUpdate: 30512,
    tip: 30513,
    stakeLock: 30502,
    stakeRelease: 30520,
    stakeCancel: 30521,
    dispute: 30522,
    resolution: 30524,
    rating: 30530,
    proofOfCollection: 30570,
    proofOfDelivery: 30571,
    conditionPhoto: 30572,
    panic: 30560
  }
};

module.exports = profile;
