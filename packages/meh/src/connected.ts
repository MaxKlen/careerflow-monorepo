import { GoogleGenAI } from "@google/genai";
import type { MehProvider, MehRequest, MehResponse } from "./types.js";

let provider: MehProvider | null = null;
export function configureProvider(p: MehProvider | null): void {
  provider = p;
}
export function getProvider(): MehProvider | null {
  return provider;
}
export function hasProvider(): boolean {
  return provider !== null;
}

export interface GeminiProviderConfig {
  apiKey: string;
  model: string;
  systemPrompt: string;
  timeoutMs?: number;
}
export function createGeminiProvider(cfg: GeminiProviderConfig): MehProvider {
  const client = new GoogleGenAI({ apiKey: cfg.apiKey });
  return {
    name: `gemini:${cfg.model}`,
    async complete(req: MehRequest): Promise<MehResponse> {
      const response = await client.models.generateContent({
        model: cfg.model,
        contents: `${cfg.systemPrompt}\n\nScreen: ${req.screen}\n\nCareer-coaching request:\n${req.prompt}`,
        config: { temperature: 0.3, maxOutputTokens: 800 },
      });
      const body = response.text?.trim() ?? "";
      if (!body) throw new Error("gemini_empty_response");
      return { kind: "suggestion", body, sources: [], modeKind: "connected" };
    },
  };
}
export function createFallbackProvider(
  primary: MehProvider,
  fallback: MehProvider,
): MehProvider {
  return {
    name: `${primary.name}->${fallback.name}`,
    async complete(req: MehRequest): Promise<MehResponse> {
      try {
        return await primary.complete(req);
      } catch {
        return fallback.complete(req);
      }
    },
  };
}
