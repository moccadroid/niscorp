import type { z } from 'zod';

// ═══════════════════════════════════════════════════════════
// Solid story types
// ═══════════════════════════════════════════════════════════

export type StreamDemoStory = {
  id: string;
  name: string;
  description: string;
  category: string;
  kind: 'stream-demo';
  pitch?: { headline: string; body: string };
  demo: {
    schema: z.ZodType;
    initial: unknown;
    json: string;
    chunkMode: 'char' | 'token' | 'fixed';
    chunkSize?: number;
    delayMs: number;
    tokensPerSecond?: number;
    selectPaths?: string[];
  };
  code?: string;
  expected?: {
    finalValue?: unknown;
    finalizationOrder?: string[];
  };
};

export const isStreamDemoStory = (value: unknown): value is StreamDemoStory => {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return v['kind'] === 'stream-demo' && typeof v['id'] === 'string' && typeof v['demo'] === 'object';
};
