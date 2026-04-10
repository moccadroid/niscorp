import type { z } from 'zod';
import type { Message, Tool, SignalOptions, SignalResult } from '@niscorp/signal';

// ═══════════════════════════════════════════════════════════
// Recipe story shape — a single signal demo:
// take a setup (provider/model/messages/tools/etc.), run it
// either against a snapshot or against a live API call.
// ═══════════════════════════════════════════════════════════

// Only the openai-compatible adapter is wired up today, so the only
// usable providers are these three. Anthropic and Google adapters are
// stubs that throw "not yet implemented".
export type RecipeProvider = 'openai' | 'openrouter' | 'groq';

export type RecipeSetup = {
  provider: RecipeProvider;
  model?: string;
  systemPrompt?: string;
  history?: Message[];
  schema?: z.ZodTypeAny;
  tools?: Tool[];
  options?: SignalOptions;
  input: string;
};

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

// One-liner that sells *why* this recipe matters to a developer.
// Rendered as a callout above the chat.
export type RecipePitch = {
  headline: string;
  body: string;
};

// How to render the assistant's structured output. 'json' = collapsible
// JSON viewer; 'card' = render as a styled card (uses CardSchema fields).
export type StructuredRender = 'json' | 'card';

export type RecipeStory = {
  id: string;
  name: string;
  description: string;
  category: string;
  kind: 'recipe';
  setup: RecipeSetup;
  snapshot?: RecipeSnapshot;
  expected?: RecipeExpectation;
  pitch?: RecipePitch;
  // Idiomatic TypeScript snippet that recreates this recipe — copy/paste ready.
  code?: string;
  // How to render structured (object) responses in the chat.
  structuredRender?: StructuredRender;
};

export const isRecipeStory = (value: unknown): value is RecipeStory => {
  if (value === null || typeof value !== 'object') return false;
  if (Reflect.get(value, 'kind') !== 'recipe') return false;
  if (typeof Reflect.get(value, 'id') !== 'string') return false;
  if (typeof Reflect.get(value, 'name') !== 'string') return false;
  if (typeof Reflect.get(value, 'description') !== 'string') return false;
  if (typeof Reflect.get(value, 'category') !== 'string') return false;
  const setup = Reflect.get(value, 'setup');
  if (setup === null || typeof setup !== 'object') return false;
  return true;
};
