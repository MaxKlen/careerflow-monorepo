import type { MehProvider, MehRequest, MehResponse } from './types.js';

export interface OpenAIProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  maxTokens?: number;
  timeoutMs?: number;
}

export function createOpenAIProvider(cfg: OpenAIProviderConfig): MehProvider {
  const name = `openai-compatible:${cfg.model}`;
  return {
    name,
    async complete(req: MehRequest): Promise<MehResponse> {
      const url = `${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), cfg.timeoutMs ?? 30000);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${cfg.apiKey}`,
          },
          body: JSON.stringify({
            model: cfg.model,
            max_tokens: cfg.maxTokens ?? 800,
            messages: [
              { role: 'system', content: cfg.systemPrompt },
              { role: 'user', content: `Screen: ${req.screen}\n\n${req.prompt}` },
            ],
          }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`provider returned HTTP ${res.status}`);
        const json = await res.json() as { choices?: { message?: { content?: string } }[] };
        const body = json.choices?.[0]?.message?.content ?? '';
        if (!body) throw new Error('provider returned empty content');
        return { kind: 'suggestion', body, sources: [], modeKind: 'connected' };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
