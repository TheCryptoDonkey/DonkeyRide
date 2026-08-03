/**
 * Cleaning Domain Profile
 *
 * Implements the TROTT `cleaning` domain profile (kind range 30740-30759):
 * regular domestic cleaning, deep cleans, end-of-tenancy.
 *
 * The simplest lifecycle in the set — book, arrive, clean, done. Recurring
 * arrangements create a separate task per session rather than one long-lived
 * task, so each visit stands or falls on its own record.
 *
 * Stakes are symmetric here, unlike most domains. A regular cleaning
 * relationship runs for months in both directions; neither side is the one
 * being trusted.
 *
 * Domestic cleaning is unregulated in the UK. Nothing in the profile
 * pretends otherwise — the reputation layer is the only accountability
 * there is, which is exactly the case the protocol was written for.
 */

const profile = {
  id: 'cleaning',
  name: 'DonkeyClean',
  description: 'Domestic and specialist cleaning sessions with a per-visit record.',

  discoveryMethod: 'geohash',
  pricingModel: 'hourly',

  states: {
    values: {
      REQUESTED: 'session_requested',
      MATCHED: 'cleaner_matched',
      PROVIDER_EN_ROUTE: 'en_route',
      PROVIDER_ARRIVED: 'arrived',
      ACTIVE: 'cleaning_active',
      COMPLETED: 'completed',
      CANCELLED: 'cancelled',
      NO_SHOW: 'no_show'
    },
    transitions: {
      'session_requested': ['cleaner_matched', 'cancelled'],
      'cleaner_matched': ['en_route', 'cancelled'],
      'en_route': ['arrived', 'cancelled'],
      'arrived': ['cleaning_active', 'no_show', 'cancelled'],
      'cleaning_active': ['completed', 'cancelled']
    },
    terminal: ['completed', 'no_show', 'cancelled'],
    initial: 'session_requested'
  },

  roles: {
    requester: 'client',
    provider: 'cleaner'
  },

  labels: {
    originLabel: 'Property address',
    destinationLabel: '',
    taskNoun: 'clean',
    requestVerb: 'Book a clean',
    activeVerb: 'Cleaning in progress',
    completedLabel: 'Clean Complete',
    originInstruction: 'Tap the map to set the property',
    destinationInstruction: '',
    accessRequesterTitle: 'What does this clean involve?',
    accessRequesterHint: 'These never change the price. They match you with a cleaner set up for the job.',
    accessProviderTitle: 'What can you take on?',
    accessProviderHint: 'Only tick what is genuinely true — someone is planning their day around it.',
  },

  stakingModel: {
    requesterStakePercent: 0.10,
    providerStakePercent: 0.10,
    penaltyPercent: 0.80
  },

  completionProofTypes: ['gps_arrival', 'photo'],
  disputeEvidenceTypes: ['text', 'photo'],

  ratingCriteria: [
    { tag: 'overall', label: 'Overall', weight: 0.25 },
    { tag: 'thoroughness', label: 'Thoroughness', weight: 0.25 },
    { tag: 'punctuality', label: 'Punctuality', weight: 0.20 },
    { tag: 'trustworthiness', label: 'Trustworthiness', weight: 0.15 },
    { tag: 'attention_to_detail', label: 'Attention to detail', weight: 0.15 }
  ],

  dataRetention: {
    taskData: 90,
    locationData: 30,
    paymentData: 2555
  },

  encryptionRequired: false,

  credentials: [
    {
      id: 'public_liability',
      label: 'Public liability insurance',
      description: 'Cover for damage caused while working in somebody\'s home',
      expires: true,
      required: false
    },
    {
      id: 'coshh_training',
      label: 'COSHH training',
      description: 'Safe handling of cleaning chemicals — relevant for specialist work',
      expires: true,
      required: false
    }
  ],

  regulatoryBodies: {
    dbs: {
      name: 'Disclosure and Barring Service',
      required: false,
      description: 'Not a statutory requirement for domestic cleaning, but recommended where the cleaner holds keys'
    },
    coshh: {
      name: 'COSHH (Control of Substances Hazardous to Health)',
      required: false,
      description: 'Applies to commercial cleaning with certain products'
    }
  },

  features: {
    navigation: true,
    liveTracking: false,
    tipping: true,
    safetyAlerts: true,
    photos: true,
    signatures: false,
    quoteNegotiation: false,
    guaranteePeriod: false,
    requiresDestination: false
  },

  // Requirements, not price bands. Someone who needs their own products
  // used because of an allergy is not buying a premium clean.
  accessOptions: [
    {
      id: 'brings_supplies',
      label: 'Bring cleaning supplies',
      description: 'The cleaner provides products and equipment',
      providerPrompt: 'I bring my own products and equipment'
    },
    {
      id: 'client_products_only',
      label: 'Use my products only',
      description: 'Allergies, pets or surfaces that need specific products',
      providerPrompt: 'I am happy to use the client\'s own products'
    },
    {
      id: 'key_held',
      label: 'Key-held access',
      description: 'Cleaner holds a key and works while nobody is home',
      providerPrompt: 'I take key-held arrangements (DBS checked)'
    },
    {
      id: 'oven_clean',
      label: 'Oven cleaning',
      description: 'Needs oven cleaning kit and specialist products',
      providerPrompt: 'I do oven cleaning'
    },
    {
      id: 'laundry_ironing',
      label: 'Laundry and ironing',
      description: 'Washing, drying and ironing as part of the session',
      providerPrompt: 'I do laundry and ironing'
    },
    {
      id: 'pets_present',
      label: 'Pets in the property',
      description: 'A cat or dog will be home during the clean',
      providerPrompt: 'I am comfortable working around pets'
    }
  ],

  theme: {
    primary: '#0d9488',
    primaryRgb: '13, 148, 136',
    secondary: '#0f766e',
    secondaryRgb: '15, 118, 110',
    accent: '#5eead4',
    accentRgb: '94, 234, 212',
    gradientFrom: '#0d9488',
    gradientTo: '#0f766e',
    gradientAngle: '135deg',
    routeColour: '#0d9488',
    emoji: '🧽',
  },
};

module.exports = profile;
