import type { CreateWorkspaceInput } from '@careerflow/shared';
import { CreateWorkspaceInput as Schema } from '@careerflow/shared';

export interface WorkspacePlan {
  name: string;
  kind: 'personal' | 'sample';
  isSample: boolean;
  analyticsEligible: boolean;
}

export function planWorkspace(input: unknown): WorkspacePlan {
  const parsed: CreateWorkspaceInput = Schema.parse(input);
  return {
    name: parsed.name,
    kind: parsed.kind,
    isSample: parsed.kind === 'sample',
    analyticsEligible: parsed.kind !== 'sample',
  };
}
