/**
 * Pet Services Domain Profile
 *
 * Implements the TROTT `pet-services` domain profile (kind range
 * 30700-30719): dog walking, sitting, grooming, drop-in visits.
 *
 * The carer travels to the owner, checks in, runs the session, and checks
 * out — so the lifecycle is dispatch plus a sustained active phase, and the
 * GPS trace of a walk is the proof the walk happened at all.
 *
 * The carer's stake is higher than the requester's here, which is unusual
 * for this codebase. It is deliberate and taken from the spec: a carer who
 * abandons a booking leaves a living animal without food, water or exercise.
 */

const profile = {
  id: 'pet-services',
  name: 'DonkeyPaws',
  description: 'Pet walking, sitting and grooming with a verifiable session record.',

  discoveryMethod: 'geohash',
  pricingModel: 'hourly',

  states: {
    values: {
      REQUESTED: 'booking_requested',
      MATCHED: 'carer_matched',
      PROVIDER_EN_ROUTE: 'en_route',
      PROVIDER_ARRIVED: 'arrived',
      CHECK_IN: 'check_in',
      ACTIVE: 'session_active',
      COMPLETED: 'check_out',
      CANCELLED: 'cancelled',
      NO_SHOW: 'no_show'
    },
    transitions: {
      'booking_requested': ['carer_matched', 'cancelled'],
      'carer_matched': ['en_route', 'cancelled'],
      'en_route': ['arrived', 'cancelled'],
      'arrived': ['check_in', 'no_show', 'cancelled'],
      // Handover of the animal. Everything after this point is custody.
      'check_in': ['session_active', 'cancelled'],
      'session_active': ['check_out', 'cancelled']
    },
    terminal: ['check_out', 'no_show', 'cancelled'],
    initial: 'booking_requested'
  },

  roles: {
    requester: 'pet owner',
    provider: 'pet carer'
  },

  labels: {
    originLabel: 'Where the pet is',
    destinationLabel: '',
    taskNoun: 'session',
    requestVerb: 'Book a carer',
    activeVerb: 'Session in progress',
    completedLabel: 'Session Complete',
    originInstruction: 'Tap the map to set where the pet will be collected',
    destinationInstruction: '',
    accessRequesterTitle: 'What does your pet need?',
    accessRequesterHint: 'These never change the price. They match you with a carer who can meet them.',
    accessProviderTitle: 'What can you take on?',
    accessProviderHint: 'Only tick what is genuinely true — an animal will be relying on it.',
  },

  stakingModel: {
    requesterStakePercent: 0.10,
    providerStakePercent: 0.20,
    penaltyPercent: 0.80
  },

  completionProofTypes: ['gps_trace', 'photo'],
  disputeEvidenceTypes: ['text', 'photo', 'gps_trace'],

  ratingCriteria: [
    { tag: 'overall', label: 'Overall', weight: 0.25 },
    { tag: 'punctuality', label: 'Punctuality', weight: 0.15 },
    { tag: 'animal_care', label: 'Animal care', weight: 0.25 },
    { tag: 'safety', label: 'Safety', weight: 0.20 },
    { tag: 'communication', label: 'Communication', weight: 0.15 }
  ],

  dataRetention: {
    taskData: 90,
    locationData: 30,
    paymentData: 2555
  },

  encryptionRequired: false,

  // The Animal Welfare Act duty of care applies to a temporary carer, and
  // boarding or day care is licensable by the local authority.
  credentials: [
    {
      id: 'animal_activity_licence',
      label: 'Animal activity licence',
      description: 'Issued by the local authority for boarding, day care or home boarding',
      expires: true,
      required: false
    },
    {
      id: 'pet_insurance',
      label: 'Pet care liability insurance',
      description: 'Cover for an animal in your care',
      expires: true,
      required: false
    }
  ],

  regulatoryBodies: {
    animalWelfareAct: {
      name: 'Animal Welfare Act 2006',
      required: true,
      description: 'A duty of care applies to anyone responsible for an animal, including temporary carers'
    },
    animalActivityLicence: {
      name: 'Animal Activity Licence (local authority)',
      required: false,
      description: 'Mandatory for boarding and day care in England under the 2018 Regulations. Dog walking is not a licensable activity.'
    }
  },

  features: {
    navigation: true,
    liveTracking: true,
    tipping: true,
    safetyAlerts: true,
    photos: true,
    signatures: false,
    quoteNegotiation: false,
    guaranteePeriod: false,
    requiresDestination: false
  },

  // Requirements, not price bands. A dog on medication is not a premium
  // booking; it is a booking only some carers should be taking.
  accessOptions: [
    {
      id: 'large_breed',
      label: 'Large or strong breed',
      description: 'Needs someone who can physically handle the dog',
      providerPrompt: 'I can handle large or strong dogs'
    },
    {
      id: 'reactive',
      label: 'Reactive or nervous',
      description: 'Reacts to other dogs, strangers or traffic',
      providerPrompt: 'I have experience with reactive or nervous animals'
    },
    {
      id: 'medication',
      label: 'Needs medication',
      description: 'Medication must be given during the session',
      providerPrompt: 'I can administer medication'
    },
    {
      id: 'puppy',
      label: 'Puppy or senior',
      description: 'Needs more frequent breaks and closer supervision',
      providerPrompt: 'I take puppies and senior animals'
    },
    {
      id: 'exotic',
      label: 'Exotic or small animal',
      description: 'Reptile, bird, rabbit or other non-cat-or-dog',
      providerPrompt: 'I care for exotic and small animals'
    },
    {
      id: 'multiple_pets',
      label: 'More than one pet',
      description: 'Several animals in the same session',
      providerPrompt: 'I can take more than one animal at a time'
    }
  ],

  theme: {
    primary: '#16a34a',
    primaryRgb: '22, 163, 74',
    secondary: '#15803d',
    secondaryRgb: '21, 128, 61',
    accent: '#4ade80',
    accentRgb: '74, 222, 128',
    gradientFrom: '#16a34a',
    gradientTo: '#15803d',
    gradientAngle: '135deg',
    routeColour: '#16a34a',
    emoji: '🐕',
  },
};

module.exports = profile;
