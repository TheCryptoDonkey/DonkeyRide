/**
 * Security Guarding Domain Profile
 *
 * Implements the TROTT `security` domain profile (kind range 30720-30739):
 * static guarding, patrols, door supervision, key holding.
 *
 * Shift-shaped rather than journey-shaped. Once briefed, the officer cycles
 * between on station, patrolling and handling an incident until the shift
 * ends — so those three are mutually reachable rather than a line.
 *
 * Safety check-ins are not a nicety in this domain: an officer who stops
 * answering may be injured. Alone on a site at night is the working
 * condition, not the exception.
 *
 * SIA licensing is the one hard gate here. Providing licensable security
 * services without the correct licence is a criminal offence, and
 * self-declaration is not verification — an operator must check the SIA
 * public register before matching anyone.
 */

const profile = {
  id: 'security',
  name: 'DonkeyGuard',
  description: 'Security officer assignments with patrol checkpoints and safety check-ins throughout the shift.',

  discoveryMethod: 'geohash',
  pricingModel: 'hourly',

  states: {
    values: {
      REQUESTED: 'assignment_requested',
      MATCHED: 'officer_matched',
      PROVIDER_EN_ROUTE: 'en_route',
      PROVIDER_ARRIVED: 'arrived',
      BRIEFED: 'briefed',
      ACTIVE: 'on_station',
      PATROLLING: 'patrolling',
      INCIDENT: 'incident',
      COMPLETED: 'shift_complete',
      CANCELLED: 'cancelled',
      NO_SHOW: 'no_show'
    },
    transitions: {
      'assignment_requested': ['officer_matched', 'cancelled'],
      'officer_matched': ['en_route', 'cancelled'],
      'en_route': ['arrived', 'cancelled'],
      'arrived': ['briefed', 'no_show', 'cancelled'],
      'briefed': ['on_station', 'cancelled'],
      // The shift itself. An officer moves between these freely and the
      // shift can end from any of them — an incident that runs past the
      // end of the shift still has to be closable.
      'on_station': ['patrolling', 'incident', 'shift_complete', 'cancelled'],
      'patrolling': ['on_station', 'incident', 'shift_complete', 'cancelled'],
      'incident': ['on_station', 'patrolling', 'shift_complete', 'cancelled']
    },
    terminal: ['shift_complete', 'no_show', 'cancelled'],
    initial: 'assignment_requested'
  },

  roles: {
    requester: 'client',
    provider: 'security officer'
  },

  labels: {
    originLabel: 'Site address',
    destinationLabel: '',
    taskNoun: 'assignment',
    requestVerb: 'Book an officer',
    activeVerb: 'On duty',
    completedLabel: 'Shift Complete',
    originInstruction: 'Tap the map to set the site',
    destinationInstruction: '',
    accessRequesterTitle: 'What does this assignment involve?',
    accessRequesterHint: 'These never change the price. They match you with an officer licensed for the work.',
    accessProviderTitle: 'What are you licensed for?',
    accessProviderHint: 'Only tick the SIA licence categories you actually hold — working outside them is a criminal offence.',
  },

  stakingModel: {
    requesterStakePercent: 0.10,
    providerStakePercent: 0.20,
    penaltyPercent: 0.80
  },

  completionProofTypes: ['gps_arrival', 'checkin_log', 'patrol_checkpoints'],
  disputeEvidenceTypes: ['text', 'photo', 'gps_trace', 'checkin_log'],

  ratingCriteria: [
    { tag: 'overall', label: 'Overall', weight: 0.25 },
    { tag: 'alertness', label: 'Alertness', weight: 0.25 },
    { tag: 'professionalism', label: 'Professionalism', weight: 0.25 },
    { tag: 'communication', label: 'Communication', weight: 0.15 },
    { tag: 'punctuality', label: 'Punctuality', weight: 0.10 }
  ],

  // Patrol logs and incident reports are kept a year for SIA compliance;
  // the raw location trace still goes at thirty days.
  dataRetention: {
    taskData: 365,
    locationData: 30,
    paymentData: 2555
  },

  encryptionRequired: false,

  // SIA is a statutory licence: the profile says so, and the officer
  // declares theirs here. Self-attested — the SIA public register is the
  // only authority, and this operator is not it.
  credentials: [
    {
      id: 'sia_licence',
      label: 'SIA licence',
      description: 'Front line licence for the category you are working — check the number against the SIA public register',
      expires: true,
      required: true
    },
    {
      id: 'first_aid',
      label: 'First aid at work',
      description: 'Often required by the client rather than the regulator',
      expires: true,
      required: false
    }
  ],

  regulatoryBodies: {
    sia: {
      name: 'Security Industry Authority',
      required: true,
      description: 'Statutory regulator under the Private Security Industry Act 2001. Providing licensable security services without the correct SIA licence is a criminal offence — verify against the SIA public register, never on self-declaration.'
    }
  },

  features: {
    navigation: true,
    liveTracking: true,
    tipping: false,
    safetyAlerts: true,
    photos: true,
    signatures: false,
    quoteNegotiation: false,
    guaranteePeriod: false,
    requiresDestination: false
  },

  // SIA licence categories, as requirements rather than price bands. Fail
  // closed: an assignment naming a category is invisible to anyone who has
  // not declared they hold it.
  accessOptions: [
    {
      id: 'security_guarding',
      label: 'Security guarding',
      description: 'Static guarding or patrol of premises',
      providerPrompt: 'I hold an SIA Security Guarding licence'
    },
    {
      id: 'door_supervision',
      label: 'Door supervision',
      description: 'Licensed premises, events, crowd entry',
      providerPrompt: 'I hold an SIA Door Supervision licence'
    },
    {
      id: 'close_protection',
      label: 'Close protection',
      description: 'Personal protection of an individual',
      providerPrompt: 'I hold an SIA Close Protection licence'
    },
    {
      id: 'cctv',
      label: 'CCTV surveillance',
      description: 'Public space surveillance operation',
      providerPrompt: 'I hold an SIA Public Space Surveillance (CCTV) licence'
    },
    {
      id: 'key_holding',
      label: 'Key holding',
      description: 'Holding keys and responding to alarm activations',
      providerPrompt: 'I hold an SIA Key Holding licence'
    },
    {
      id: 'dog_handler',
      label: 'Dog handler',
      description: 'Assignment requires a working security dog',
      providerPrompt: 'I work with a licensed security dog'
    }
  ],

  theme: {
    primary: '#1d4ed8',
    primaryRgb: '29, 78, 216',
    secondary: '#1e40af',
    secondaryRgb: '30, 64, 175',
    accent: '#60a5fa',
    accentRgb: '96, 165, 250',
    gradientFrom: '#1d4ed8',
    gradientTo: '#1e40af',
    gradientAngle: '135deg',
    routeColour: '#1d4ed8',
    emoji: '🛡️',
  },
};

module.exports = profile;
