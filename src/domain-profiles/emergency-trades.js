/**
 * Emergency Trades Domain Profile
 *
 * Implements the TROTT `emergency-trades` domain profile (kind range
 * 30680-30699): burst pipes, dead consumer units, gas leaks, broken windows.
 *
 * Dispatch only — nobody travels anywhere afterwards. The total is unknown
 * when the tradesperson is called out, so the lifecycle expands the active
 * phase into diagnosis → quote → acceptance → work, and each stage is priced
 * and approved before it starts. That approval gate is the domain's reason
 * for existing: the emergency callout is the classic setting for a price
 * agreed under duress.
 *
 * The required trade is modelled as an access requirement rather than a
 * service class. It filters WHO may take the job and never changes the
 * price — matching a burst-pipe callout to someone who does not do plumbing
 * helps nobody, and gas work carried out by an unregistered person is a
 * criminal offence, not a preference.
 */

const profile = {
  id: 'emergency-trades',
  name: 'DonkeyFix',
  description: 'Emergency trade callouts with milestone pricing approved stage by stage.',

  discoveryMethod: 'geohash',
  pricingModel: 'milestone',

  states: {
    values: {
      REQUESTED: 'callout_reported',
      MATCHED: 'tradesperson_matched',
      PROVIDER_EN_ROUTE: 'en_route',
      PROVIDER_ARRIVED: 'arrived',
      DIAGNOSIS: 'diagnosis',
      QUOTE_PROVIDED: 'quote_provided',
      QUOTE_ACCEPTED: 'quote_accepted',
      ACTIVE: 'work_active',
      COMPLETED: 'work_complete',
      CANCELLED: 'cancelled',
      NO_SHOW: 'no_show'
    },
    transitions: {
      'callout_reported': ['tradesperson_matched', 'cancelled'],
      'tradesperson_matched': ['en_route', 'cancelled'],
      'en_route': ['arrived', 'cancelled'],
      'arrived': ['diagnosis', 'no_show', 'cancelled'],
      'diagnosis': ['quote_provided', 'cancelled'],
      // A declined quote ends the task; the diagnosis fee stands, and the
      // householder owes nothing further.
      'quote_provided': ['quote_accepted', 'cancelled'],
      'quote_accepted': ['work_active', 'cancelled'],
      'work_active': ['work_complete', 'cancelled']
    },
    terminal: ['work_complete', 'no_show', 'cancelled'],
    initial: 'callout_reported'
  },

  roles: {
    requester: 'householder',
    provider: 'tradesperson'
  },

  labels: {
    originLabel: 'Property address',
    destinationLabel: '',
    taskNoun: 'callout',
    requestVerb: 'Report emergency',
    activeVerb: 'Work in progress',
    completedLabel: 'Work Complete',
    originInstruction: 'Tap the map to set the property',
    destinationInstruction: '',
    accessRequesterTitle: 'What kind of tradesperson do you need?',
    accessRequesterHint: 'This never changes the price. It matches you with someone qualified to do the work.',
    accessProviderTitle: 'What trades are you qualified for?',
    accessProviderHint: 'Only tick what you are genuinely certified to do — gas work without Gas Safe registration is a criminal offence.',
  },

  stakingModel: {
    requesterStakePercent: 0.10,
    providerStakePercent: 0.15,
    penaltyPercent: 0.80
  },

  completionProofTypes: ['photo', 'gps_arrival'],
  disputeEvidenceTypes: ['text', 'photo', 'price_quote'],

  ratingCriteria: [
    { tag: 'overall', label: 'Overall', weight: 0.20 },
    { tag: 'response_time', label: 'Response time', weight: 0.20 },
    { tag: 'diagnosis_accuracy', label: 'Diagnosis accuracy', weight: 0.20 },
    { tag: 'workmanship', label: 'Workmanship', weight: 0.20 },
    { tag: 'pricing_transparency', label: 'Pricing transparency', weight: 0.10 },
    { tag: 'tidiness', label: 'Tidiness', weight: 0.10 }
  ],

  // Guarantee claims outlive the job: a twelve-month guarantee needs the
  // diagnosis and completion evidence to still exist when it is called on.
  dataRetention: {
    taskData: 455,
    locationData: 30,
    paymentData: 2555
  },

  encryptionRequired: false,

  // Gas work without registration is a criminal offence, so a trade
  // declares what it holds and the householder sees it before committing.
  credentials: [
    {
      id: 'gas_safe',
      label: 'Gas Safe registration',
      description: 'Mandatory for any gas work — the householder can check your number on the Gas Safe register',
      expires: true,
      required: false
    },
    {
      id: 'part_p',
      label: 'Part P / NICEIC registration',
      description: 'Competent person scheme for notifiable electrical work',
      expires: true,
      required: false
    },
    {
      id: 'public_liability',
      label: 'Public liability insurance',
      description: 'Cover for damage caused while working in somebody\'s home',
      expires: true,
      required: false
    }
  ],

  regulatoryBodies: {
    gasSafe: {
      name: 'Gas Safe Register',
      required: true,
      description: 'Mandatory for all gas work. Working on gas unregistered is a criminal offence under the Gas Safety (Installation and Use) Regulations 1998.'
    },
    niceic: {
      name: 'NICEIC / NAPIT (Part P)',
      required: false,
      description: 'Notifiable electrical work in England and Wales must be done by a registered competent person or inspected by Building Control'
    },
    consumerRights: {
      name: 'Consumer Rights Act 2015',
      required: true,
      description: 'Work must be carried out with reasonable care, skill, time and price'
    }
  },

  features: {
    navigation: true,
    liveTracking: true,
    tipping: false,
    safetyAlerts: true,
    photos: true,
    signatures: false,
    quoteNegotiation: true,
    guaranteePeriod: true,
    requiresDestination: false
  },

  // Trade requirements. Fail closed exactly like a wheelchair ramp: a
  // callout naming a trade is invisible to, and unacceptable by, anyone who
  // has not declared it.
  accessOptions: [
    {
      id: 'plumber',
      label: 'Plumber',
      description: 'Leaks, burst pipes, blocked waste, no water',
      providerPrompt: 'I take plumbing callouts'
    },
    {
      id: 'electrician',
      label: 'Electrician',
      description: 'No power, tripping circuits, exposed wiring',
      providerPrompt: 'I take electrical callouts (Part P registered)'
    },
    {
      id: 'gas_engineer',
      label: 'Gas engineer',
      description: 'Gas leaks, boiler failure, no heating',
      providerPrompt: 'I am on the Gas Safe Register'
    },
    {
      id: 'roofer',
      label: 'Roofer',
      description: 'Storm damage, water coming through the ceiling',
      providerPrompt: 'I take roofing callouts'
    },
    {
      id: 'glazier',
      label: 'Glazier',
      description: 'Broken or insecure window or door',
      providerPrompt: 'I take glazing callouts'
    },
    {
      id: 'drain_specialist',
      label: 'Drain specialist',
      description: 'Blocked or overflowing drains',
      providerPrompt: 'I take drainage callouts'
    }
  ],

  theme: {
    primary: '#dc2626',
    primaryRgb: '220, 38, 38',
    secondary: '#b91c1c',
    secondaryRgb: '185, 28, 28',
    accent: '#f87171',
    accentRgb: '248, 113, 113',
    gradientFrom: '#dc2626',
    gradientTo: '#b91c1c',
    gradientAngle: '135deg',
    routeColour: '#dc2626',
    emoji: '🔧',
  },
};

module.exports = profile;
