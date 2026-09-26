import { ConfigSchema, evaluate, type Config, type JsonValue } from '@niscorp/prism';
import { createUpgrader, type Sequence, type Transform, type Upgrader } from '@niscorp/strata';
import { NOVA_SEQUENCE } from '@niscorp/nova/migrations';
import { PRISM_SEQUENCE } from '@niscorp/prism/migrations';

// ═══════════════════════════════════════════════════════════════
// The grammars a moss deployment reads and writes documents in: nova's (its
// actions, fragments and layouts), Prism's (the configs inside them), and the
// app's own (`NiscApp.grammars` — its component kit's props, say). One upgrader
// over all of them, built at boot: it brings stored rows current, upgrades what
// an add-on submits from the stamp the add-on declares, and stamps what moss
// writes.
//
// A document migration is a Prism config, evaluated here exactly the way an
// endpoint's request is — the same engine, the same safety (no code runs).
// ═══════════════════════════════════════════════════════════════

const isJsonValue = (value: unknown): value is JsonValue => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value === 'object') return Object.values(value).every(isJsonValue);
  return false;
};

// A migration's config is parsed once — the same object is handed back for
// every node it rewrites — and at the boundary, like any config (rule 13).
const parsedConfigs = new WeakMap<object, Config>();
const configOf = (raw: unknown): Config => {
  const cached = typeof raw === 'object' && raw !== null ? parsedConfigs.get(raw) : undefined;
  if (cached !== undefined) return cached;
  const config = ConfigSchema.parse(raw);
  if (typeof raw === 'object' && raw !== null) parsedConfigs.set(raw, config);
  return config;
};

export const prismTransform: Transform = (config, source) => {
  if (!isJsonValue(source)) throw new Error('A document to migrate must be plain JSON.');
  return evaluate(configOf(config), source);
};

// nova's and Prism's grammars, then the app's own, in that order.
export const grammarsOf = (app: { grammars?: readonly Sequence[] }): readonly Sequence[] => [
  NOVA_SEQUENCE,
  PRISM_SEQUENCE,
  ...(app.grammars ?? []),
];

export const createGrammarUpgrader = (app: { grammars?: readonly Sequence[] }): Promise<Upgrader> =>
  createUpgrader(grammarsOf(app), { transform: prismTransform });
