/**
 * Domain Profile Schema
 *
 * Defines the structure and validation for domain profiles.
 * Each domain (ridesharing, locksmith, delivery, etc.) provides
 * a profile that parameterises the generic task coordination engine.
 */

/**
 * Validate a domain profile against the required schema.
 * Throws descriptive errors for missing or invalid fields.
 *
 * @param {Object} profile - The domain profile to validate
 * @throws {Error} If the profile is invalid
 * @returns {Object} The validated profile (with defaults applied)
 */
function validateProfile(profile) {
  if (!profile || typeof profile !== 'object') {
    throw new Error('Domain profile must be an object');
  }

  // Required string fields
  const requiredStrings = ['id', 'name', 'discoveryMethod', 'pricingModel'];
  for (const field of requiredStrings) {
    if (!profile[field] || typeof profile[field] !== 'string') {
      throw new Error(`Domain profile requires a '${field}' string`);
    }
  }

  // States
  if (!profile.states || typeof profile.states !== 'object') {
    throw new Error('Domain profile requires a \'states\' object');
  }
  if (!profile.states.values || typeof profile.states.values !== 'object') {
    throw new Error('Domain profile states must have a \'values\' object mapping state keys to string values');
  }
  if (!profile.states.transitions || typeof profile.states.transitions !== 'object') {
    throw new Error('Domain profile states must have a \'transitions\' object');
  }
  if (!profile.states.terminal || !Array.isArray(profile.states.terminal)) {
    throw new Error('Domain profile states must have a \'terminal\' array');
  }
  if (!profile.states.initial || typeof profile.states.initial !== 'string') {
    throw new Error('Domain profile states must have an \'initial\' string');
  }

  // Validate all terminal states exist in values
  const stateStrings = Object.values(profile.states.values);
  for (const term of profile.states.terminal) {
    if (!stateStrings.includes(term)) {
      throw new Error(`Terminal state '${term}' not found in states.values`);
    }
  }

  // Validate initial state exists
  if (!stateStrings.includes(profile.states.initial)) {
    throw new Error(`Initial state '${profile.states.initial}' not found in states.values`);
  }

  // Validate transitions reference valid states
  for (const [from, toArray] of Object.entries(profile.states.transitions)) {
    if (!stateStrings.includes(from)) {
      throw new Error(`Transition source '${from}' not found in states.values`);
    }
    if (!Array.isArray(toArray)) {
      throw new Error(`Transition targets for '${from}' must be an array`);
    }
    for (const to of toArray) {
      if (!stateStrings.includes(to)) {
        throw new Error(`Transition target '${to}' not found in states.values`);
      }
    }
  }

  // Roles
  if (!profile.roles || typeof profile.roles !== 'object') {
    throw new Error('Domain profile requires a \'roles\' object');
  }
  if (!profile.roles.requester || typeof profile.roles.requester !== 'string') {
    throw new Error('Domain profile roles must have a \'requester\' string');
  }
  if (!profile.roles.provider || typeof profile.roles.provider !== 'string') {
    throw new Error('Domain profile roles must have a \'provider\' string');
  }

  // Apply defaults for optional fields
  const validated = {
    ...profile,
    stakingModel: profile.stakingModel || {
      requesterStakePercent: 0.10,
      providerStakePercent: 0.15,
      penaltyPercent: 0.80
    },
    completionProofTypes: profile.completionProofTypes || ['gps_arrival'],
    disputeEvidenceTypes: profile.disputeEvidenceTypes || ['text', 'photo'],
    ratingCriteria: profile.ratingCriteria || [
      { tag: 'overall', label: 'Overall', weight: 1.0 }
    ],
    dataRetention: profile.dataRetention || {
      taskData: 90,
      locationData: 30,
      paymentData: 2555
    },
    encryptionRequired: profile.encryptionRequired || false,
    regulatoryBodies: profile.regulatoryBodies || {},
    labels: {
      originLabel: 'Pickup',
      destinationLabel: 'Dropoff',
      taskNoun: 'task',
      requestVerb: 'Request',
      activeVerb: 'In progress',
      completedLabel: 'Complete',
      originInstruction: 'Tap the map to set your location',
      destinationInstruction: 'Now tap to set your destination',
      ...profile.labels
    },
    features: {
      navigation: true,
      liveTracking: true,
      tipping: true,
      safetyAlerts: true,
      photos: false,
      signatures: false,
      quoteNegotiation: false,
      guaranteePeriod: false,
      requiresDestination: true,
      ...profile.features
    },
    eventKinds: {
      // TROTT-02 discovery
      taskAnnouncement: 37500,
      providerAvailability: 20500,
      operatorBond: 30511,
      // TROTT-01 lifecycle
      stateTransition: 7501,
      stateSnapshot: 30078,
      // TROTT-04 / TROTT-04b payments
      quote: 30530,
      paymentTerms: 30531,
      stakeLock: 30532,
      settlement: 30533,
      paymentReceipt: 30535,
      earningsSummary: 30538,
      // TROTT-03 reputation
      rating: 30520,
      // TROTT-05 safety
      panic: 30540,
      safetyCheckIn: 30541,
      // TROTT-05b / TROTT-05c disputes and abuse
      disputeClaim: 7543,
      disputeResolution: 30545,
      abuseReport: 30546,
      // TROTT-06 operator participation
      operatorClaim: 30550,
      operatorHeartbeat: 30554,
      // NIP-57 zaps
      tip: 9735,
      ...profile.eventKinds
    },
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
      emoji: '',
      ...profile.theme,
    }
  };

  return validated;
}

/**
 * Create the default profile schema template.
 * Useful for documentation and tooling.
 *
 * @returns {Object} Schema template with descriptions
 */
function getSchemaTemplate() {
  return {
    id: '(string) Unique domain identifier, e.g. "ridesharing"',
    name: '(string) Human-readable domain name, e.g. "Ridesharing"',
    description: '(string) Brief description of the domain',
    discoveryMethod: '(string) "geohash" | "skillTags" | "availability"',
    pricingModel: '(string) "distance_time_surge" | "distance_weight" | "hourly" | "milestone" | "flatRate" | "quote"',
    states: {
      values: '(object) Map of STATE_KEY to state string value',
      transitions: '(object) Map of state string to array of valid next states',
      terminal: '(array) States that end the lifecycle',
      initial: '(string) Starting state'
    },
    roles: {
      requester: '(string) Domain term for the requesting party, e.g. "rider"',
      provider: '(string) Domain term for the providing party, e.g. "driver"'
    },
    labels: {
      originLabel: '(string) Label for origin/pickup location, e.g. "Pickup"',
      destinationLabel: '(string) Label for destination/dropoff location, e.g. "Dropoff"',
      taskNoun: '(string) Noun for the task, e.g. "ride", "callout", "delivery"',
      requestVerb: '(string) Verb for requesting, e.g. "Request", "Report lockout"',
      activeVerb: '(string) Label for active state, e.g. "In transit"',
      completedLabel: '(string) Label for completion, e.g. "Ride Complete"',
      originInstruction: '(string) Instruction for setting origin on map',
      destinationInstruction: '(string) Instruction for setting destination on map'
    },
    stakingModel: {
      requesterStakePercent: '(number) Fraction of fare staked by requester (default 0.10)',
      providerStakePercent: '(number) Fraction of fare staked by provider (default 0.15)',
      penaltyPercent: '(number) Fraction of stake forfeited on cancellation (default 0.80)'
    },
    completionProofTypes: '(array) e.g. ["gps_arrival", "photo", "signature"]',
    disputeEvidenceTypes: '(array) e.g. ["text", "photo", "gps_trace"]',
    ratingCriteria: '(array) e.g. [{ tag: "punctuality", label: "Punctuality", weight: 0.3 }]',
    dataRetention: {
      taskData: '(number) Days to retain task records',
      locationData: '(number) Days to retain location data',
      paymentData: '(number) Days to retain payment records'
    },
    encryptionRequired: '(boolean) Whether all task data must be encrypted at rest',
    regulatoryBodies: '(object) e.g. { gasSafe: { name: "Gas Safe Register", required: true } }',
    features: {
      navigation: '(boolean) Whether the domain uses road navigation',
      liveTracking: '(boolean) Whether real-time location tracking is used',
      tipping: '(boolean) Whether tipping is enabled',
      safetyAlerts: '(boolean) Whether panic/safety features are enabled',
      photos: '(boolean) Whether photo evidence is used',
      signatures: '(boolean) Whether digital signatures are collected',
      quoteNegotiation: '(boolean) Whether quote-then-accept flow is used',
      guaranteePeriod: '(boolean) Whether post-completion guarantee tracking is used'
    },
    eventKinds: '(object) Map of operation names to Nostr event kind numbers'
  };
}

module.exports = {
  validateProfile,
  getSchemaTemplate
};
