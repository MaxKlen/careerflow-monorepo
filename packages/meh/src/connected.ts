import type { MehProvider } from './types.js';

let provider: MehProvider | null = null;

export function configureProvider(p: MehProvider | null): void { provider = p; }
export function getProvider(): MehProvider | null { return provider; }
export function hasProvider(): boolean { return provider !== null; }
