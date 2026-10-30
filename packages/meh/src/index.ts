import { offlineGuidance } from './offline.js';
import { getProvider } from './connected.js';
import type { MehRequest, MehResponse } from './types.js';
import type { MehMode } from './modes.js';

export type { MehRequest, MehResponse, MehProvider } from './types.js';
export type { MehMode } from './modes.js';
export { configureProvider, hasProvider } from './connected.js';
export { offlineGuidance } from './offline.js';
export { createOpenAIProvider } from './openaiProvider.js';
export type { OpenAIProviderConfig } from './openaiProvider.js';
export { MEH_SYSTEM_PROMPT } from './prompts.js';

export async function respond(req: MehRequest, mode: MehMode): Promise<MehResponse> {
  if (mode.kind === 'offline') {
    return offlineGuidance(req);
  }
  const provider = getProvider();
  if (!provider) {
    return {
      kind: 'refusal',
      body: 'Connected assistant is not enabled in this deployment. Offline guidance is still available.',
      sources: [],
      modeKind: 'connected',
    };
  }
  return provider.complete(req);
}
