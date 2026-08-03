/**
 * Ridesharing Domain Profile
 *
 * The default domain profile, matching the original DonkeyRide protocol.
 * Geospatial discovery, distance+time pricing, GPS trace completion proof.
 */

const profile = {
  id: 'ridesharing',
  name: 'DonkeyRide',
  description: 'Peer-to-peer ridesharing coordination with real-time tracking and direct rider-to-driver settlement.',

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
      CANCELLED: 'cancelled',
      NO_SHOW: 'no_show'
    },
    transitions: {
      'requested': ['matched', 'cancelled'],
      'matched': ['en_route', 'cancelled'],
      'en_route': ['arrived', 'cancelled'],
      'arrived': ['active', 'no_show', 'cancelled'],
      'active': ['completed', 'cancelled']
    },
    terminal: ['completed', 'no_show', 'cancelled'],
    initial: 'requested'
  },

  roles: {
    requester: 'rider',
    provider: 'driver'
  },

  labels: {
    originLabel: 'Pickup',
    destinationLabel: 'Dropoff',
    taskNoun: 'ride',
    requestVerb: 'Request',
    activeVerb: 'In transit',
    completedLabel: 'Ride Complete',
    originInstruction: 'Tap the map to set your pickup location',
    destinationInstruction: 'Now tap to set your destination',
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
    photos: false,
    signatures: false,
    quoteNegotiation: false,
    guaranteePeriod: false,
    requiresDestination: true
  },

  // Service classes. The whole rate card is scaled by fareMultiplier, so
  // the breakdown always sums to the quoted fare. `seats` is what a driver
  // must be able to seat to serve the class — a driver only receives jobs
  // for classes their vehicle can actually take.
  serviceOptions: [
    {
      id: 'standard',
      label: 'Standard',
      description: 'Everyday car, up to 4 seats',
      fareMultiplier: 1,
      seats: 4
    },
    {
      id: 'comfort',
      label: 'Comfort',
      description: 'Newer, roomier car',
      fareMultiplier: 1.3,
      seats: 4
    },
    {
      id: 'xl',
      label: 'XL',
      description: 'Up to 6 seats — luggage or a group',
      fareMultiplier: 1.6,
      seats: 6
    }
  ],

  // Access needs. Deliberately NOT service classes: a wheelchair user may
  // want a Standard car, and needing a child seat should not price someone
  // into Comfort. They are requirements that filter WHO can take the job,
  // exactly like women-only matching, and they never change the fare.
  //
  // Fail closed: a request carrying a need is invisible to, and unacceptable
  // by, any provider who has not declared they can meet it. Getting this
  // wrong strands the person who most needed it to be right.
  accessOptions: [
    {
      id: 'wheelchair',
      label: 'Wheelchair accessible',
      description: 'Ramp or lift, and space for a wheelchair',
      providerPrompt: 'My vehicle is wheelchair accessible'
    },
    {
      id: 'step_free',
      label: 'Step-free / assistance',
      description: 'Driver can help with a walking frame or heavy bags',
      providerPrompt: 'I can help with mobility aids and bags'
    },
    {
      id: 'child_seat',
      label: 'Child seat',
      description: 'A fitted child seat is available',
      providerPrompt: 'I carry a child seat'
    },
    {
      id: 'assistance_dog',
      label: 'Assistance dog',
      description: 'An assistance dog travels with the passenger',
      providerPrompt: 'Assistance dogs are welcome in my vehicle'
    },
    {
      id: 'pet_friendly',
      label: 'Pet friendly',
      description: 'A pet travels with the passenger',
      providerPrompt: 'Pets are welcome in my vehicle'
    },
    {
      id: 'extra_luggage',
      label: 'Extra luggage',
      description: 'More than the boot of an everyday car takes',
      providerPrompt: 'I have room for extra luggage'
    }
  ],

  theme: {
    primary: '#b24cf3',
    primaryRgb: '178, 76, 243',
    secondary: '#ff6ec7',
    secondaryRgb: '255, 110, 199',
    accent: '#00ff88',
    accentRgb: '0, 255, 136',
    gradientFrom: '#b24cf3',
    gradientTo: '#ff6ec7',
    gradientAngle: '135deg',
    routeColour: '#b24cf3',
    emoji: '🚗',
  },
};

module.exports = profile;
