import type { ComponentType } from 'react';
import type { z } from 'zod';
import type { ConstraintsMode, ValidationMode } from '@niscorp/solid';

// ═══════════════════════════════════════════════════════════
// Each solid story points at a sibling `*.recipe.tsx` that
// exports a full React `Demo` component — the authored code
// that runs on Start. The showroom mounts it and, when the
// story opts in via `showModeSwitcher`, passes a `mode` prop
// so the user can re-run under `trust` / `recover` / `strict`.
//
// `schema`, `initial`, `json` are re-exported from the recipe
// so the Setup inspector tab has a single source of truth.
// ═══════════════════════════════════════════════════════════

export type RecipeModule = {
  schema: z.ZodType;
  initial: unknown;
  json: string;
  Demo: ComponentType<{ mode?: ValidationMode; constraints?: ConstraintsMode }>;
};

export type StreamDemoStory = {
  id: string;
  name: string;
  description: string;
  category: string;
  kind: 'stream-demo';
  pitch?: { headline: string; body: string };
  recipe: RecipeModule;
  showModeSwitcher?: boolean;
  expected?: {
    finalValue?: unknown;
    finalizationOrder?: string[];
  };
};

export const isStreamDemoStory = (value: unknown): value is StreamDemoStory => {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return v['kind'] === 'stream-demo' && typeof v['id'] === 'string' && typeof v['recipe'] === 'object';
};
