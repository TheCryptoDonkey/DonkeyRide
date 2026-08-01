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
  name: 'DonkeyKnock',
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
      CANCELLED: 'cancelled',
      NO_SHOW: 'no_show'
    },
    transitions: {
      'lockout_reported': ['locksmith_matched', 'cancelled'],
      'locksmith_matched': ['en_route', 'cancelled'],
      'en_route': ['arrived', 'cancelled'],
      'arrived': ['access_method_confirmed', 'no_show', 'cancelled'],
      'access_method_confirmed': ['work_active', 'cancelled'],
      'work_active': ['access_gained', 'cancelled']
    },
    terminal: ['access_gained', 'no_show', 'cancelled'],
    initial: 'lockout_reported'
  },

  roles: {
    requester: 'customer',
    provider: 'locksmith'
  },

  labels: {
    originLabel: 'Lockout location',
    destinationLabel: '',
    taskNoun: 'callout',
    requestVerb: 'Report lockout',
    activeVerb: 'Work in progress',
    completedLabel: 'Access Gained',
    originInstruction: 'Tap the map to set your lockout location',
    destinationInstruction: '',
  },

  stakingModel: {
    requesterStakePercent: 0.10,
    providerStakePercent: 0.15,
    penaltyPercent: 0.80
  },

  completionProofTypes: ['gps_arrival', 'photo'],
  disputeEvidenceTypes: ['text', 'photo', 'gps_trace', 'price_quote'],

  ratingCriteria: [
    { tag: 'overall', label: 'Overall', weight: 0.25 },
    { tag: 'punctuality', label: 'Punctuality', weight: 0.20 },
    { tag: 'workmanship', label: 'Workmanship', weight: 0.25 },
    { tag: 'pricing_fairness', label: 'Pricing fairness', weight: 0.15 },
    { tag: 'tidiness', label: 'Tidiness', weight: 0.15 }
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
    guaranteePeriod: true,
    requiresDestination: false
  },

  theme: {
    primary: '#f59e0b',
    primaryRgb: '245, 158, 11',
    secondary: '#d97706',
    secondaryRgb: '217, 119, 6',
    accent: '#fbbf24',
    accentRgb: '251, 191, 36',
    gradientFrom: '#f59e0b',
    gradientTo: '#d97706',
    gradientAngle: '135deg',
    routeColour: '#f59e0b',
    emoji: '🔑',
  },
};

module.exports = profile;
