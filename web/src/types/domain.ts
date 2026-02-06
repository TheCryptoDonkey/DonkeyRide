/** Domain profile as returned by /api/domains/current */
export interface DomainProfile {
  id: string;
  name: string;
  description?: string;
  discoveryMethod: 'geohash' | 'skillTags' | 'availability';
  pricingModel: 'distance_time_surge' | 'hourly' | 'milestone' | 'flatRate' | 'quote';
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
  streaming: boolean;
  photos: boolean;
  signatures: boolean;
  quoteNegotiation: boolean;
  guaranteePeriod: boolean;
}
