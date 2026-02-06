/**
 * Locksmith Dispatch Domain Profile
 *
 * Protocol fit: 10/10. The single best non-ridesharing application.
 * UK locksmith industry is plagued by scam operators who quote low
 * and charge high on arrival. Commitment stakes directly solve this.
 *
 * Locksmiths are unregulated in the UK (no mandatory licensing).
 * The protocol provides the trust layer that regulation otherwise would.
 */

const profile = {
  id: 'locksmith',
  name: 'Locksmith Dispatch',
  description: 'Emergency locksmith dispatch with transparent pricing and anti-scam commitment stakes.',

  discoveryMethod: 'geohash',
  pricingModel: 'flatRate',

  states: {
    values: {
      REQUESTED: 'lockout_reported',
      MATCHED: 'locksmith_matched',
      PROVIDER_EN_ROUTE: 'en_route',
      PROVIDER_ARRIVED: 'arrived',
      METHOD_CONFIRMED: 'access_method_confirmed',
      ACTIVE: 'work_active',
      COMPLETED: 'access_gained',
      CANCELLED: 'cancelled'
    },
    transitions: {
      'lockout_reported': ['locksmith_matched', 'cancelled'],
      'locksmith_matched': ['en_route', 'cancelled'],
      'en_route': ['arrived', 'cancelled'],
      'arrived': ['access_method_confirmed', 'cancelled'],
      'access_method_confirmed': ['work_active', 'cancelled'],
      'work_active': ['access_gained', 'cancelled']
    },
    terminal: ['access_gained', 'cancelled'],
    initial: 'lockout_reported'
  },

  roles: {
    requester: 'customer',
    provider: 'locksmith'
  },

  stakingModel: {
    requesterStakePercent: 0.10,
    providerStakePercent: 0.15,
    penaltyPercent: 0.80
  },

  completionProofTypes: ['gps_arrival', 'photo'],
  disputeEvidenceTypes: ['text', 'photo', 'gps_trace', 'price_quote'],

  ratingCriteria: [
    { tag: 'overall', label: 'Overall', weight: 0.3 },
    { tag: 'punctuality', label: 'Punctuality', weight: 0.2 },
    { tag: 'transparency', label: 'Price transparency', weight: 0.3 },
    { tag: 'skill', label: 'Skill', weight: 0.2 }
  ],

  dataRetention: {
    taskData: 365,
    locationData: 30,
    paymentData: 2555
  },

  encryptionRequired: false,

  regulatoryBodies: {
    mla: {
      name: 'Master Locksmiths Association',
      required: false,
      description: 'Voluntary certification — not mandatory but builds trust'
    }
  },

  features: {
    navigation: true,
    liveTracking: true,
    tipping: true,
    safetyAlerts: true,
    streaming: false,
    photos: true,
    signatures: false,
    quoteNegotiation: true,
    guaranteePeriod: true
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
    quoteIssued: 30601,
    quoteAccepted: 30602,
    guaranteeStart: 30605,
    panic: 30560
  }
};

module.exports = profile;
