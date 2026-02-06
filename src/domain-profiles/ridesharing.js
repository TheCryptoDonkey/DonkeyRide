/**
 * Ridesharing Domain Profile
 *
 * The default domain profile, matching the original DonkeyRide protocol.
 * Geospatial discovery, distance+time+surge pricing, GPS trace completion proof.
 */

const profile = {
  id: 'ridesharing',
  name: 'Ridesharing',
  description: 'Peer-to-peer ridesharing coordination with real-time tracking and streaming payments.',

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
      CANCELLED: 'cancelled'
    },
    transitions: {
      'requested': ['matched', 'cancelled'],
      'matched': ['en_route', 'cancelled'],
      'en_route': ['arrived', 'cancelled'],
      'arrived': ['active', 'cancelled'],
      'active': ['completed', 'cancelled']
    },
    terminal: ['completed', 'cancelled'],
    initial: 'requested'
  },

  roles: {
    requester: 'rider',
    provider: 'driver'
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
    streaming: true,
    photos: false,
    signatures: false,
    quoteNegotiation: false,
    guaranteePeriod: false
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
    vehicleTracking: 30540,
    safetyCheckIn: 30561,
    safetyCheckAck: 30562,
    panic: 30560
  }
};

module.exports = profile;
