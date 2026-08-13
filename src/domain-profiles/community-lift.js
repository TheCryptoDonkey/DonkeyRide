/**
 * Community Lift Domain Profile
 *
 * A shared, non-commercial journey: one organiser, one driver and one or
 * more passengers dropped off in a declared order. There is deliberately no
 * fare, stake, tip or settlement rail. Each passenger handoff is confirmed
 * with a short code held by the organiser/receiving guardian.
 */

module.exports = {
  id: 'community-lift',
  name: 'Community Lift',
  description: 'Shared lifts with ordered passenger drop-offs, guardian handoff confirmation and no payment.',

  discoveryMethod: 'geohash',
  pricingModel: 'none',

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
      requested: ['matched', 'cancelled'],
      matched: ['en_route', 'cancelled'],
      en_route: ['arrived', 'cancelled'],
      arrived: ['active', 'no_show', 'cancelled'],
      active: ['completed', 'cancelled']
    },
    terminal: ['completed', 'no_show', 'cancelled'],
    initial: 'requested'
  },

  roles: {
    requester: 'organiser',
    provider: 'driver'
  },

  labels: {
    originLabel: 'Meeting point',
    destinationLabel: 'Last drop-off',
    taskNoun: 'lift',
    requestVerb: 'Arrange',
    activeVerb: 'Dropping off',
    completedLabel: 'Everyone dropped off',
    originInstruction: 'Choose the shared meeting point',
    destinationInstruction: 'Choose the last passenger drop-off'
  },

  stakingModel: {
    requesterStakePercent: 0,
    providerStakePercent: 0,
    penaltyPercent: 0
  },

  completionProofTypes: ['gps_trace', 'handoff_code'],
  disputeEvidenceTypes: ['text', 'gps_trace', 'handoff_log'],

  ratingCriteria: [
    { tag: 'overall', label: 'Overall', weight: 0.4 },
    { tag: 'punctuality', label: 'Punctuality', weight: 0.2 },
    { tag: 'safety', label: 'Safety', weight: 0.2 },
    { tag: 'communication', label: 'Communication', weight: 0.2 }
  ],

  dataRetention: {
    taskData: 30,
    locationData: 7,
    paymentData: 0
  },

  encryptionRequired: true,
  regulatoryBodies: {},

  credentials: [
    {
      id: 'dbs_check',
      label: 'DBS or safeguarding check',
      description: 'A current safeguarding-related check declared by the driver',
      expires: true,
      // Open operators merely display this self-declaration. A regulated
      // operator that enables credential gating requires it.
      required: true
    }
  ],

  features: {
    navigation: true,
    liveTracking: true,
    tipping: false,
    safetyAlerts: true,
    photos: false,
    signatures: false,
    quoteNegotiation: false,
    guaranteePeriod: false,
    requiresDestination: true,
    settlementRequired: false,
    multiPassengerHandoffs: true,
    routeRequired: true,
    // A public Nostr snapshot deliberately contains no names, exact stops or
    // code digests. A production lift therefore needs the private task store
    // to survive an operator restart while passengers are still travelling.
    durableTaskDataRequired: true,
    // Once the journey ends there is no operational reason to retain a
    // child's name, guardian, route or handoff secret in the database.
    redactSensitiveDataOnTerminal: true
  },

  serviceOptions: [
    {
      id: 'standard',
      label: 'Up to 4 passengers',
      description: 'An everyday car with four passenger seats',
      fareMultiplier: 1,
      seats: 4
    },
    {
      id: 'xl',
      label: 'Up to 6 passengers',
      description: 'A larger vehicle with six passenger seats',
      fareMultiplier: 1,
      seats: 6
    }
  ],

  accessOptions: [
    {
      id: 'child_seat',
      label: 'Child seat needed',
      description: 'A suitable fitted child seat is required',
      providerPrompt: 'I carry a suitable child seat'
    },
    {
      id: 'step_free',
      label: 'Step-free / assistance',
      description: 'A passenger needs mobility assistance',
      providerPrompt: 'I can help with mobility aids'
    }
  ],

  theme: {
    primary: '#3b82f6',
    primaryRgb: '59, 130, 246',
    secondary: '#14b8a6',
    secondaryRgb: '20, 184, 166',
    accent: '#fbbf24',
    accentRgb: '251, 191, 36',
    gradientFrom: '#2563eb',
    gradientTo: '#0d9488',
    gradientAngle: '135deg',
    routeColour: '#2563eb',
    emoji: '🚙'
  }
};
