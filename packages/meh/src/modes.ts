export type MehMode =
  | { kind: 'offline'; reason: 'demo' | 'no_consent' | 'network_unavailable' }
  | { kind: 'connected'; consentRecordId: string; providerId: string };
