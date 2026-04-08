import type { JsonObject } from '@niscorp/prism';

// ═══════════════════════════════════════════════════════════
// Prism story shape — a single transformation demo:
// take an input JSON, apply a prism config, optionally compare
// the output to an expected value.
// ═══════════════════════════════════════════════════════════

export type PrismStory = {
  id: string;
  name: string;
  description: string;
  category: string;
  kind: 'transform';
  input: JsonObject;
  config: unknown;
  expected?: unknown;
};

// Type guard — narrows `unknown` (received via the LibraryModule
// interface) to `PrismStory`. No casts.
export const isPrismStory = (value: unknown): value is PrismStory => {
  if (value === null || typeof value !== 'object') return false;
  if (!('id' in value) || !('name' in value) || !('description' in value)) return false;
  if (!('category' in value) || !('kind' in value)) return false;
  if (!('input' in value) || !('config' in value)) return false;
  if (Reflect.get(value, 'kind') !== 'transform') return false;
  if (typeof Reflect.get(value, 'id') !== 'string') return false;
  if (typeof Reflect.get(value, 'name') !== 'string') return false;
  if (typeof Reflect.get(value, 'description') !== 'string') return false;
  if (typeof Reflect.get(value, 'category') !== 'string') return false;
  return true;
};
