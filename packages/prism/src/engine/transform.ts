import { ConfigSchema } from '../schemas/config.schema';
import { desugar } from '../sugar/desugar';
import type { JsonValue } from '../types';
import { evaluateNode, refuseDeep, run } from './evaluate';
import { optimize } from './optimize';

// ═══════════════════════════════════════════════════════════
// Prism, in the shape a host's transform seam takes
//
// nova's shell, tide's engine and strata's upgrader each run a config through
// an INJECTED transform, `(config, source) => unknown`, and know nothing of
// Prism. This is Prism in that shape, for every host: the config is checked
// once at the boundary (rule 13; the same object comes back for every node a
// migration rewrites) and the source must be plain JSON.
//
// What is kept for a config object is the tree an evaluation runs — checked,
// desugared and optimized, what `compile` puts in an IR's core — so a second
// call with the same object only evaluates. Kept by the object, weakly: a
// config changed in place after its first call is not looked at again.
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

const trees = new WeakMap<object, unknown>();

const treeOf = (config: unknown): unknown => {
  const parsed = ConfigSchema.parse(config);
  refuseDeep(parsed);
  return optimize(desugar(parsed), evaluateNode).node;
};

export const prismTransform = (config: unknown, source: unknown): unknown => {
  if (!isJsonValue(source)) throw new Error('The source of a transform must be plain JSON.');
  if (typeof config !== 'object' || config === null) return run(treeOf(config), source);
  const kept = trees.get(config);
  const tree = kept ?? treeOf(config);
  if (kept === undefined) trees.set(config, tree);
  return run(tree, source, undefined, true);
};
