import { z } from 'zod';

import { NodeSchema } from '../schemas/node.schema';
import { ConfigSchema } from '../schemas/config.schema';
import type { OpKey } from '../schemas/profiles';

export type JsonSchemaTarget = 'draft-2020-12' | 'draft-7' | 'draft-4';

export const getNodeJsonSchema = (target: JsonSchemaTarget = 'draft-2020-12'): object =>
  z.toJSONSchema(NodeSchema, { target });

export const getConfigJsonSchema = (target: JsonSchemaTarget = 'draft-2020-12'): object =>
  z.toJSONSchema(ConfigSchema, { target });

// A reference is read in either spelling: drafts 4 to 7 ignore keywords beside
// a `$ref`, so a described reference is written `allOf: [{ $ref }]` there.

type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value);

const unwrapRef = (value: unknown): unknown => {
  const allOf = isObject(value) ? value['allOf'] : undefined;
  const only: unknown = Array.isArray(allOf) && allOf.length === 1 ? allOf[0] : undefined;
  return isObject(only) && '$ref' in only ? only : value;
};

const refTarget = (ref: unknown): [string, string] | undefined => {
  if (typeof ref !== 'string') return undefined;
  const match = /^#\/([^/]+)\/([^/]+)$/.exec(ref);
  return match?.[1] !== undefined && match[2] !== undefined ? [match[1], match[2]] : undefined;
};

const resolve = (root: JsonObject, ref: unknown): JsonObject | undefined => {
  const target = refTarget(ref);
  if (target === undefined) return undefined;
  const container = root[target[0]];
  const def = isObject(container) ? container[target[1]] : undefined;
  return isObject(def) ? def : undefined;
};

const opOf = (root: JsonObject, written: unknown): string | undefined => {
  const alternative = unwrapRef(written);
  const node = isObject(alternative) && '$ref' in alternative ? resolve(root, alternative['$ref']) : alternative;
  const properties = isObject(node) ? node['properties'] : undefined;
  const key = isObject(properties) ? Object.keys(properties)[0] : undefined;
  return key !== undefined && key.startsWith('$') ? key : undefined;
};

const refsIn = (value: unknown, found: Set<string>): void => {
  if (Array.isArray(value)) {
    for (const item of value) refsIn(item, found);
    return;
  }
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === '$ref' && typeof child === 'string') found.add(child);
    else refsIn(child, found);
  }
};

export const getProfileJsonSchema = (ops: readonly OpKey[], target: JsonSchemaTarget = 'draft-2020-12'): object =>
  narrowConfigJsonSchema(getConfigJsonSchema(target), ops);

export const narrowConfigJsonSchema = (full: unknown, ops: readonly OpKey[]): object => {
  if (!isObject(full)) throw new Error('prism: the config JSON Schema is not an object');
  const root = structuredClone(full);
  const top = unwrapRef(root);
  const node = resolve(root, isObject(top) ? top['$ref'] : undefined);
  const alternatives = node?.['anyOf'];
  if (node === undefined || !Array.isArray(alternatives)) throw new Error('prism: the config JSON Schema has no node union to narrow');

  const keep = new Set<string>(ops);
  node['anyOf'] = alternatives.filter((alternative) => {
    const op = opOf(root, alternative);
    return op === undefined || keep.has(op);
  });

  const reached = new Set<string>();
  const pending: string[] = [];
  const visit = (value: unknown): void => {
    const found = new Set<string>();
    refsIn(value, found);
    for (const ref of found) {
      if (reached.has(ref)) continue;
      reached.add(ref);
      pending.push(ref);
    }
  };
  visit({ ...root, $defs: undefined, definitions: undefined });
  for (let ref = pending.pop(); ref !== undefined; ref = pending.pop()) visit(resolve(root, ref));

  for (const container of ['$defs', 'definitions']) {
    const defs = root[container];
    if (!isObject(defs)) continue;
    for (const name of Object.keys(defs)) if (!reached.has(`#/${container}/${name}`)) delete defs[name];
  }
  return root;
};
