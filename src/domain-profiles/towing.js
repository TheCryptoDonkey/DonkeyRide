/**
 * Vehicle Recovery (Towing) Domain Profile
 *
 * Implements the TROTT `towing` domain profile (kind range 30660-30679).
 *
 * Dispatch plus trip: the recovery operator travels to a breakdown, assesses
 * the vehicle on site, issues a BINDING quote, and only then loads and
 * transports. The assessment sits between arrival and the trip because the
 * true price of a recovery is not knowable until someone has looked at the
 * car — which is precisely the moment a scam operator quotes low and charges
 * high. Committing the quote on the wire before the vehicle moves is the
 * whole point of running this domain on TROTT.
 *
 * Note for Mode-B operators: the spec's travel-only stake (30% of the
 * operator's stake, forfeited when a motorist declines the on-site quote)
 * has no schema field here — a non-custodial operator holds no stake to
 * apportion. Licensed custodial operators implement it in their rail.
 */

const profile = {
  id: 'towing',
  name: 'DonkeyTow',
  description: 'Vehicle recovery dispatch with a binding on-site quote before the vehicle is loaded.',

  discoveryMethod: 'geohash',
  pricingModel: 'flatRate',

  states: {
    values: {
      REQUESTED: 'recovery_requested',
      MATCHED: 'operator_matched',
      PROVIDER_EN_ROUTE: 'en_route',
      PROVIDER_ARRIVED: 'arrived',
      VEHICLE_ASSESSED: 'vehicle_assessed',
      VEHICLE_LOADED: 'vehicle_loaded',
      ACTIVE: 'in_transit',
      COMPLETED: 'delivered',
      CANCELLED: 'cancelled',
      NO_SHOW: 'no_show'
    },
    transitions: {
      'recovery_requested': ['operator_matched', 'cancelled'],
      'operator_matched': ['en_route', 'cancelled'],
      'en_route': ['arrived', 'cancelled'],
      'arrived': ['vehicle_assessed', 'no_show', 'cancelled'],
      // A declined on-site quote goes straight to cancelled — it never
      // passes through vehicle_assessed.
      'vehicle_assessed': ['vehicle_loaded', 'cancelled'],
      'vehicle_loaded': ['in_transit', 'cancelled'],
      'in_transit': ['delivered', 'cancelled']
    },
    terminal: ['delivered', 'no_show', 'cancelled'],
    initial: 'recovery_requested'
  },

  roles: {
    requester: 'motorist',
    provider: 'recovery operator'
  },

  labels: {
    originLabel: 'Breakdown location',
    destinationLabel: 'Destination',
    taskNoun: 'recovery',
    requestVerb: 'Report breakdown',
    activeVerb: 'Vehicle in transit',
    completedLabel: 'Vehicle Delivered',
    originInstruction: 'Tap the map to set where the vehicle is',
    destinationInstruction: 'Now tap to set the garage or address it is going to',
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
    { tag: 'response_time', label: 'Response time', weight: 0.25 },
    { tag: 'professionalism', label: 'Professionalism', weight: 0.20 },
    { tag: 'care_of_vehicle', label: 'Care of vehicle', weight: 0.20 },
    { tag: 'pricing_fairness', label: 'Pricing fairness', weight: 0.10 }
  ],

  // Assessment and delivery records are kept a year for insurance claims;
  // the location trace is not — a recovery is one journey, not a history.
  dataRetention: {
    taskData: 365,
    locationData: 30,
    paymentData: 2555
  },

  encryptionRequired: false,

  regulatoryBodies: {
    trafficCommissioner: {
      name: 'Traffic Commissioner (Operator\'s Licence)',
      required: false,
      description: 'Mandatory for recovering vehicles over 3,500 kg. Operators must verify the licence category.'
    },
    ivr: {
      name: 'Institute of Vehicle Recovery',
      required: false,
      description: 'Voluntary industry body — not mandatory, but a trust signal'
    }
  },

  features: {
    navigation: true,
    liveTracking: true,
    tipping: true,
    safetyAlerts: true,
    photos: true,
    signatures: false,
    quoteNegotiation: true,
    guaranteePeriod: false,
    requiresDestination: true
  },

  // Recovery method scales the whole rate card, so the breakdown still sums
  // to the quote. A motorist who needs a flatbed is not buying a "premium"
  // tow — they are buying the only method that can move their car.
  serviceOptions: [
    {
      id: 'wheel_lift',
      label: 'Wheel lift',
      description: 'Standard tow for a rolling vehicle',
      fareMultiplier: 1
    },
    {
      id: 'flatbed',
      label: 'Flatbed',
      description: 'Vehicle carried, not towed — non-driveable or damaged',
      fareMultiplier: 1.35
    },
    {
      id: 'heavy',
      label: 'Heavy recovery',
      description: 'Over 3,500 kg — requires an Operator\'s Licence',
      fareMultiplier: 2.2
    }
  ],

  theme: {
    primary: '#ea580c',
    primaryRgb: '234, 88, 12',
    secondary: '#c2410c',
    secondaryRgb: '194, 65, 12',
    accent: '#fb923c',
    accentRgb: '251, 146, 60',
    gradientFrom: '#ea580c',
    gradientTo: '#c2410c',
    gradientAngle: '135deg',
    routeColour: '#ea580c',
    emoji: '🚛',
  },
};

module.exports = profile;
