import type { Reflex } from '../schemas';
import type { EffectRegistry, Row, SelectFn, TideEvent, TideStore, TransformFn } from '../types';

export type LoadedReflex = {
  reflex: Reflex;
  version: string;
  armedAt: number;
};

export type EngineDeps = {
  store: TideStore;
  transform: TransformFn;
  select?: SelectFn;
  effectsFor: (as: string | undefined) => EffectRegistry;
  actorFor: (as: string | undefined) => unknown;
  maxChainDepth: number;
  maxChainFacts: number;
  maxFanOut: number;
  leaseMs: number;
  emit: (event: TideEvent) => void;
  reflexes: () => readonly LoadedReflex[];
  find: (id: string) => LoadedReflex | undefined;
  nextToken: () => string;
};

export type EnvParts = {
  params?: Row;
  occurrence?: { key: string; at: number; tz?: string };
  fact?: Row;
  facts?: readonly Row[];
  row?: Row;
  rows?: readonly Row[];
  now: number;
};

export const buildEnv = (parts: EnvParts): Row => {
  const env: Row = { params: parts.params ?? {}, now: parts.now };
  if (parts.occurrence !== undefined) env.occurrence = parts.occurrence;
  if (parts.fact !== undefined) env.fact = parts.fact;
  if (parts.facts !== undefined) env.facts = parts.facts;
  if (parts.row !== undefined) env.row = parts.row;
  if (parts.rows !== undefined) env.rows = parts.rows;
  return env;
};

export const withNow = (env: Row, now: number): Row => ({ ...env, now });

export const evaluateTemplate = (transform: TransformFn, config: unknown, env: Row): unknown =>
  config === undefined ? undefined : transform(config, env);

export const isTruthy = (value: unknown): boolean => {
  if (value === undefined || value === null || value === false) return false;
  if (value === 0 || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

const canonical = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(value)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : 1));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${canonical(entryValue)}`).join(',')}}`;
};

export const versionOf = (reflex: Reflex): string => {
  const { enabled: _enabled, ...definition } = reflex;
  const text = canonical(definition);
  let hashA = 0x811c9dc5;
  let hashB = 0x01000193;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    hashA = Math.imul(hashA ^ code, 0x01000193) >>> 0;
    hashB = Math.imul(hashB ^ ((code << 3) | index % 7), 0x85ebca6b) >>> 0;
  }
  return `v_${hashA.toString(16).padStart(8, '0')}${hashB.toString(16).padStart(8, '0')}`;
};
