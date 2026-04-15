import type { ComponentType } from 'react';
import type { z } from 'zod';
import type { Message, SignalResult, Tool } from '@niscorp/signal';

// ═══════════════════════════════════════════════════════════
// Story shape for signal demos.
//
// Each story points at a *.recipe.{ts,tsx} module. The recipe
// is the actual TypeScript a user would write — imports, the
// Zod schema, the call function (for chat) or a React Demo
// component (for streams). The showroom's runner invokes that
// same function / mounts that same component directly: what
// you see in the Source tab is what runs.
//
// Everything else on the story object is showroom metadata
// (name, pitch, expected, snapshot) and renders around the
// recipe.
// ═══════════════════════════════════════════════════════════

export type RecipeProvider = 'openai' | 'openrouter' | 'groq';

// How to render structured (object) responses in the chat.
// 'json' = collapsible JSON viewer; 'card' = styled card.
export type StructuredRender = 'json' | 'card';

// ═══════════════════════════════════════════════════════════
// Recipe modules
// ═══════════════════════════════════════════════════════════

// Non-streaming (chat) recipe. The recipe file exports a plain
// async `complete` function — user copy-pastes into Node/server.
// The showroom's ChatView calls it per user input.
export type RecipeModule<T = unknown> = {
  provider: RecipeProvider;
  model: string;
  systemPrompt?: string;
  schema?: z.ZodTypeAny;
  tools?: Tool[];
  seedHistory?: Message[];
  userInput: string;
  complete: (
    apiKey: string,
    input: string,
    history?: Message[],
    client?: unknown,
  ) => Promise<SignalResult<T>>;
};

// Streaming recipe. The recipe file exports a full React `Demo`
// component — signal chain, solid wiring, state, buttons, all
// visible in one .tsx file. The showroom's runner just mounts
// `<recipe.Demo apiKey=... client=... />`.
export type StreamRecipeModule = {
  provider: RecipeProvider;
  model: string;
  systemPrompt?: string;
  schema?: z.ZodTypeAny;
  initial?: unknown;
  userInput: string;
  Demo: ComponentType<{ apiKey: string; client?: unknown }>;
};

// ═══════════════════════════════════════════════════════════
// Story objects (showroom metadata)
// ═══════════════════════════════════════════════════════════

export type RecipeSnapshot = {
  result: SignalResult<unknown>;
  capturedAt: string;
  capturedWith: { provider: string; model: string };
  notes?: string;
};

export type RecipeExpectation = {
  contentIncludes?: string[];
  minToolCalls?: number;
  finishReason?: string;
};

export type RecipePitch = {
  headline: string;
  body: string;
};

export type RecipeStory = {
  id: string;
  name: string;
  description: string;
  category: string;
  kind: 'recipe';
  recipe: RecipeModule;
  snapshot?: RecipeSnapshot;
  expected?: RecipeExpectation;
  pitch?: RecipePitch;
  structuredRender?: StructuredRender;
};

export type StreamStory = {
  id: string;
  name: string;
  description: string;
  category: string;
  kind: 'stream';
  recipe: StreamRecipeModule;
  pitch?: RecipePitch;
};

export const isStreamStory = (value: unknown): value is StreamStory => {
  if (value === null || typeof value !== 'object') return false;
  return Reflect.get(value, 'kind') === 'stream';
};

export const isRecipeStory = (value: unknown): value is RecipeStory => {
  if (value === null || typeof value !== 'object') return false;
  if (Reflect.get(value, 'kind') !== 'recipe') return false;
  if (typeof Reflect.get(value, 'id') !== 'string') return false;
  if (typeof Reflect.get(value, 'name') !== 'string') return false;
  if (typeof Reflect.get(value, 'description') !== 'string') return false;
  if (typeof Reflect.get(value, 'category') !== 'string') return false;
  const recipe = Reflect.get(value, 'recipe');
  if (recipe === null || typeof recipe !== 'object') return false;
  return true;
};
