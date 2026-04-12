import type { z } from 'zod';
import type { ValidationMode, ConstraintsMode } from '@niscorp/solid';

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
    // Validation story knobs
    mode?: ValidationMode;
    constraints?: ConstraintsMode;
    // If set, the runner exposes a mode switcher so the user can flip
    // between trust / recover / strict on the same JSON payload.
    showModeSwitcher?: boolean;
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
