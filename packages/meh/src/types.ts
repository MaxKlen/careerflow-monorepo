export interface MehRequest {
  screen: string;
  prompt: string;
  workspaceId: string;
}

export interface MehResponse {
  kind: 'suggestion' | 'navigation' | 'refusal';
  body: string;
  sources: string[];
  modeKind: 'offline' | 'connected';
}

export interface MehProvider {
  name: string;
  complete(req: MehRequest): Promise<MehResponse>;
}
