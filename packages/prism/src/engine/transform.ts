import { ConfigSchema, type Config } from '../schemas/config.schema';
import type { JsonValue } from '../types';
import { evaluate } from './evaluate';

// ═══════════════════════════════════════════════════════════
// Prism, in the shape a host's transform seam takes
//
// nova's shell, tide's engine and strata's upgrader each run a config through
// an INJECTED transform, `(config, source) => unknown`, and know nothing of
// Prism. This is Prism in that shape, for every host: the config is parsed
// once at the boundary (rule 13; the same object comes back for every node a
// migration rewrites) and the source must be plain JSON.
//
// `evaluate` cannot be handed to a seam as it is: it takes a `JsonValue`, and
// a seam hands over whatever the host holds. Every host used to write that
// join itself — with a cast, with a JSON round trip, with a parse of its own.
// ═══════════════════════════════════════════════════════════

const isJsonValue = (value: unknown): value is JsonValue => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value === 'object') return Object.values(value).every(isJsonValue);
  return false;
};

const parsedConfigs = new WeakMap<object, Config>();

export const prismTransform = (config: unknown, source: unknown): unknown => {
  if (!isJsonValue(source)) throw new Error('The source of a transform must be plain JSON.');
  const cached = typeof config === 'object' && config !== null ? parsedConfigs.get(config) : undefined;
  const parsed = cached ?? ConfigSchema.parse(config);
  if (cached === undefined && typeof config === 'object' && config !== null) parsedConfigs.set(config, parsed);
  return evaluate(parsed, source);
};
