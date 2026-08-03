/**
 * House Moving Domain Profile
 *
 * Implements the TROTT `moving` domain profile (kind range 30760-30779).
 *
 * Origin to destination like a ride, but the middle is three physical
 * stages — loading, transit, unloading — and payment is released against
 * each. The van holds everything the client owns, which is why the route
 * matters and why the condition of the load is evidence, not paperwork.
 *
 * LIMITATION, stated plainly: the spec models a crew of two to six movers,
 * each accepting the same task and taking a split of every milestone. This
 * engine records ONE provider per task, so the profile treats the lead
 * mover as the provider of record and leaves the crew split to be settled
 * among themselves. Per-mover acceptance and TROTT-04 split payments need
 * multi-provider support in the task manager first.
 */

const profile = {
  id: 'moving',
  name: 'DonkeyMove',
  description: 'House and office moves with milestone stages from loading through to placement.',

  discoveryMethod: 'geohash',
  pricingModel: 'milestone',

  states: {
    values: {
      REQUESTED: 'move_requested',
      MATCHED: 'crew_matched',
      PROVIDER_EN_ROUTE: 'en_route',
      PROVIDER_ARRIVED: 'crew_assembled',
      LOADING: 'loading',
      ACTIVE: 'in_transit',
      UNLOADING: 'unloading',
      COMPLETED: 'completed',
      CANCELLED: 'cancelled',
      NO_SHOW: 'no_show'
    },
    transitions: {
      'move_requested': ['crew_matched', 'cancelled'],
      'crew_matched': ['en_route', 'cancelled'],
      'en_route': ['crew_assembled', 'cancelled'],
      'crew_assembled': ['loading', 'no_show', 'cancelled'],
      'loading': ['in_transit', 'cancelled'],
      'in_transit': ['unloading', 'cancelled'],
      // The client walks through and confirms placement before completion.
      'unloading': ['completed', 'cancelled']
    },
    terminal: ['completed', 'no_show', 'cancelled'],
    initial: 'move_requested'
  },

  roles: {
    requester: 'client',
    provider: 'mover'
  },

  labels: {
    originLabel: 'Moving from',
    destinationLabel: 'Moving to',
    taskNoun: 'move',
    requestVerb: 'Book a move',
    activeVerb: 'In transit',
    completedLabel: 'Move Complete',
    originInstruction: 'Tap the map to set the address you are moving from',
    destinationInstruction: 'Now tap to set the address you are moving to',
    accessRequesterTitle: 'What does this move involve?',
    accessRequesterHint: 'These never change the price. They match you with a crew equipped for the job.',
    accessProviderTitle: 'What can your crew take on?',
    accessProviderHint: 'Only tick what is genuinely true — a move that arrives without the right kit stops dead.',
  },

  stakingModel: {
    requesterStakePercent: 0.10,
    providerStakePercent: 0.10,
    penaltyPercent: 0.80
  },

  completionProofTypes: ['gps_arrival', 'photo'],
  disputeEvidenceTypes: ['text', 'photo', 'gps_trace', 'inventory'],

  ratingCriteria: [
    { tag: 'overall', label: 'Overall', weight: 0.25 },
    { tag: 'care_of_belongings', label: 'Care of belongings', weight: 0.25 },
    { tag: 'efficiency', label: 'Efficiency', weight: 0.20 },
    { tag: 'punctuality', label: 'Punctuality', weight: 0.15 },
    { tag: 'communication', label: 'Communication', weight: 0.15 }
  ],

  dataRetention: {
    taskData: 90,
    locationData: 30,
    paymentData: 2555
  },

  encryptionRequired: false,

  credentials: [
    {
      id: 'goods_in_transit',
      label: 'Goods in transit insurance',
      description: 'Cover for the customer\'s belongings while they are on your van',
      expires: true,
      required: false
    },
    {
      id: 'public_liability',
      label: 'Public liability insurance',
      description: 'Cover for damage to the property you are moving out of or into',
      expires: true,
      required: false
    },
    {
      id: 'bar_membership',
      label: 'British Association of Removers membership',
      description: 'Audited membership with an ombudsman scheme behind it',
      expires: true,
      required: false
    }
  ],

  regulatoryBodies: {
    bar: {
      name: 'British Association of Removers',
      required: false,
      description: 'Voluntary trade body — not mandatory, but a trust signal'
    },
    goodsInTransit: {
      name: 'Goods-in-transit insurance',
      required: false,
      description: 'Not statutory, but a mover carrying a household without it exposes the client to the whole loss'
    }
  },

  features: {
    navigation: true,
    liveTracking: true,
    tipping: true,
    safetyAlerts: true,
    photos: true,
    signatures: true,
    quoteNegotiation: false,
    guaranteePeriod: false,
    requiresDestination: true
  },

  // Crew size scales the whole rate card, so the breakdown still sums to
  // the quote.
  serviceOptions: [
    {
      id: 'two_person',
      label: '2-person crew',
      description: 'Flat or small house, one van load',
      fareMultiplier: 1
    },
    {
      id: 'three_person',
      label: '3-person crew',
      description: 'Two to three bedrooms',
      fareMultiplier: 1.4
    },
    {
      id: 'four_person',
      label: '4-person crew',
      description: 'Large house, or a tight schedule',
      fareMultiplier: 1.8
    }
  ],

  // Requirements, not price bands. A ground-floor flat with a piano needs
  // specific kit; so does a fourth floor with no lift.
  accessOptions: [
    {
      id: 'heavy_items',
      label: 'Piano or very heavy items',
      description: 'Needs the right equipment and enough hands',
      providerPrompt: 'We move pianos and very heavy items'
    },
    {
      id: 'no_lift',
      label: 'Stairs, no lift',
      description: 'Upper floor with no lift at one or both ends',
      providerPrompt: 'We take upper-floor moves with no lift'
    },
    {
      id: 'packing',
      label: 'Packing service',
      description: 'Crew packs the contents as well as moving them',
      providerPrompt: 'We offer packing'
    },
    {
      id: 'dismantling',
      label: 'Dismantle and reassemble',
      description: 'Beds, wardrobes and flat-pack furniture',
      providerPrompt: 'We dismantle and reassemble furniture'
    },
    {
      id: 'tail_lift',
      label: 'Tail lift needed',
      description: 'Nothing can be carried up a ramp by hand',
      providerPrompt: 'Our van has a tail lift'
    },
    {
      id: 'storage',
      label: 'Storage between dates',
      description: 'Belongings held between moving out and moving in',
      providerPrompt: 'We can store belongings between dates'
    }
  ],

  theme: {
    primary: '#7c3aed',
    primaryRgb: '124, 58, 237',
    secondary: '#6d28d9',
    secondaryRgb: '109, 40, 217',
    accent: '#a78bfa',
    accentRgb: '167, 139, 250',
    gradientFrom: '#7c3aed',
    gradientTo: '#6d28d9',
    gradientAngle: '135deg',
    routeColour: '#7c3aed',
    emoji: '🛋️',
  },
};

module.exports = profile;
