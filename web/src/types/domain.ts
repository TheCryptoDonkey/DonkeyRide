export interface DomainTheme {
  primary: string;
  primaryRgb: string;
  secondary: string;
  secondaryRgb: string;
  accent: string;
  accentRgb: string;
  gradientFrom: string;
  gradientTo: string;
  gradientAngle: string;
  routeColour: string;
  emoji: string;
}

/** Domain profile as returned by /api/domains/current */
export interface DomainProfile {
  id: string;
  name: string;
  description?: string;
  /** Whether this operator has the runtime dependencies needed to accept this domain. */
  operational?: boolean;
  unavailableReason?: string | null;
  discoveryMethod: 'geohash' | 'skillTags' | 'availability';
  pricingModel: 'none' | 'distance_time_surge' | 'distance_weight' | 'hourly' | 'milestone' | 'flatRate' | 'quote';
  /** Service classes (Standard / Comfort / XL). Empty for single-class domains. */
  serviceOptions?: {
    id: string;
    label: string;
    description?: string;
    fareMultiplier: number;
    seats?: number;
  }[];
  /**
   * Access needs (wheelchair, child seat, assistance dog…). Requirements
   * that narrow WHO can take the job — never a price band, so no
   * fareMultiplier: the fare is identical with or without them.
   */
  accessOptions?: {
    id: string;
    label: string;
    description?: string;
    /** How the same feature is phrased to a provider declaring it */
    providerPrompt?: string;
  }[];
  /**
   * Licences, registrations and cover a provider may declare for this
   * domain (private hire licence, SIA badge, goods in transit). Shown to
   * the requester as a claim, never as an operator verification.
   */
  credentials?: {
    id: string;
    label: string;
    description?: string;
    /** Whether a date is part of the claim (nearly always yes) */
    expires?: boolean;
    /** This domain says the work needs it — gated only if the operator opts in */
    required?: boolean;
  }[];
  /** True when this operator refuses accepts without the required credentials */
  enforceCredentials?: boolean;
  states: {
    values: Record<string, string>;
    transitions: Record<string, string[]>;
    terminal: string[];
    initial: string;
  };
  roles: {
    requester: string;
    provider: string;
  };
  labels: DomainLabels;
  stakingModel: {
    requesterStakePercent: number;
    providerStakePercent: number;
    penaltyPercent: number;
  };
  completionProofTypes: string[];
  disputeEvidenceTypes: string[];
  ratingCriteria: RatingCriterion[];
  dataRetention: {
    taskData: number;
    locationData: number;
    paymentData: number;
  };
  encryptionRequired: boolean;
  regulatoryBodies: Record<string, { name: string; required: boolean }>;
  features: DomainFeatures;
  eventKinds: Record<string, number>;
  theme: DomainTheme;
}

export interface DomainLabels {
  originLabel: string;
  destinationLabel: string;
  taskNoun: string;
  requestVerb: string;
  activeVerb: string;
  completedLabel: string;
  originInstruction: string;
  destinationInstruction: string;
  /**
   * Optional overrides for the access-needs picker. The default copy asks
   * about a journey, which reads wrong in a domain where the same mechanism
   * carries a trade qualification or an SIA licence category. Absent for
   * ridesharing, which keeps the translated defaults.
   */
  accessRequesterTitle?: string;
  accessRequesterHint?: string;
  accessProviderTitle?: string;
  accessProviderHint?: string;
}

export interface RatingCriterion {
  tag: string;
  label: string;
  weight: number;
}

export interface DomainFeatures {
  navigation: boolean;
  liveTracking: boolean;
  tipping: boolean;
  safetyAlerts: boolean;
  photos: boolean;
  signatures: boolean;
  quoteNegotiation: boolean;
  guaranteePeriod: boolean;
  requiresDestination: boolean;
  settlementRequired: boolean;
  multiPassengerHandoffs: boolean;
  routeRequired: boolean;
  durableTaskDataRequired: boolean;
  redactSensitiveDataOnTerminal: boolean;
}
