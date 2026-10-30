import type { SourceType } from '@careerflow/shared';

export interface SourcedClaim {
  text: string;
  sourceType: SourceType;
  sourceId?: string;
  note?: string;
}

export class ProvenanceError extends Error {
  constructor(public readonly claim: SourcedClaim) {
    super(`Claim "${claim.text.slice(0, 60)}" is missing or has invalid source.`);
  }
}

export function assertProvenance(claim: SourcedClaim): void {
  if (!claim.sourceType) throw new ProvenanceError(claim);
  const needsId: SourceType[] = ['evidence_item', 'opportunity_listing', 'profile_version'];
  if (needsId.includes(claim.sourceType) && !claim.sourceId) throw new ProvenanceError(claim);
}

export function assertAll(claims: SourcedClaim[]): void {
  for (const c of claims) assertProvenance(c);
}
