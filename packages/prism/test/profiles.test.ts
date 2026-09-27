import { describe, it, expect } from 'vitest';
import { getConfigJsonSchema, getProfileJsonSchema, MAPPING_OPS, type JsonSchemaTarget } from '../src';
import { narrowConfigJsonSchema } from '../src/engine/documentation';
import { OP_KEYS } from '../src/schemas/node.schema';

// A profile narrows what the config schema DOCUMENTS to some ops, derived
// from the full schema. It must document exactly its ops, keep everything that
// is not an op, leave no dangling or orphaned definition — and never touch the
// full schema, which is what validation and the grammar gate read.

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

// A described reference, in drafts 4–7, is `allOf: [{ $ref }]`: read either.
const unwrapRef = (value: unknown): unknown => {
  const allOf = isObject(value) ? value['allOf'] : undefined;
  const only: unknown = Array.isArray(allOf) && allOf.length === 1 ? allOf[0] : undefined;
  return isObject(only) && '$ref' in only ? only : value;
};

// The schema in the other spelling: every `$ref` with keywords beside it moved
// into `allOf: [{ $ref }]` — what zod writes for drafts 4–7 in every version but
// 4.3, the one this workspace locks. Without it the tests could not see them.
const respell = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(respell);
  if (!isObject(value)) return value;
  const out: Json = {};
  for (const [key, child] of Object.entries(value)) if (key !== '$ref') out[key] = respell(child);
  if (!('$ref' in value)) return out;
  return Object.keys(out).length === 0 ? { $ref: value['$ref'] } : { ...out, allOf: [{ $ref: value['$ref'] }] };
};

const defsOf = (schema: Json): [string, Json] => {
  for (const container of ['$defs', 'definitions']) {
    const defs = schema[container];
    if (isObject(defs)) return [container, defs];
  }
  throw new Error('no definitions');
};

const resolve = (schema: Json, ref: unknown): Json => {
  const [container, defs] = defsOf(schema);
  const name = typeof ref === 'string' ? ref.replace(`#/${container}/`, '') : '';
  const def = defs[name];
  if (!isObject(def)) throw new Error(`dangling ref ${String(ref)}`);
  return def;
};

const alternativesOf = (schema: Json): unknown[] => {
  const top = unwrapRef(schema);
  const node = resolve(schema, isObject(top) ? top['$ref'] : undefined);
  return Array.isArray(node['anyOf']) ? node['anyOf'] : [];
};

const opOf = (schema: Json, written: unknown): string | undefined => {
  const alternative = unwrapRef(written);
  const node = isObject(alternative) && '$ref' in alternative ? resolve(schema, alternative['$ref']) : alternative;
  const properties = isObject(node) ? node['properties'] : undefined;
  const key = isObject(properties) ? Object.keys(properties)[0] : undefined;
  return key?.startsWith('$') === true ? key : undefined;
};

const opsOf = (schema: Json): string[] => alternativesOf(schema).flatMap((alternative) => opOf(schema, alternative) ?? []).sort();
const otherAlternatives = (schema: Json): string[] => alternativesOf(schema).filter((alternative) => opOf(schema, alternative) === undefined).map((alternative) => JSON.stringify(alternative));

const refsIn = (value: unknown, found: Set<string>): Set<string> => {
  if (Array.isArray(value)) for (const item of value) refsIn(item, found);
  else if (isObject(value)) for (const [key, child] of Object.entries(value)) key === '$ref' && typeof child === 'string' ? found.add(child) : refsIn(child, found);
  return found;
};

const asJson = (value: unknown): Json => {
  if (!isObject(value)) throw new Error('not an object');
  return value;
};

const TARGETS: readonly JsonSchemaTarget[] = ['draft-2020-12', 'draft-7', 'draft-4'];
const CASES = TARGETS.flatMap((target) => [
  { name: target, target, wrapped: false, full: () => asJson(getConfigJsonSchema(target)), profile: () => asJson(getProfileJsonSchema(MAPPING_OPS, target)) },
  {
    name: `${target}, references spelled allOf`,
    target,
    wrapped: true,
    full: () => asJson(respell(getConfigJsonSchema(target))),
    profile: () => asJson(narrowConfigJsonSchema(respell(getConfigJsonSchema(target)), MAPPING_OPS)),
  },
]);

describe.each(CASES)('the mapping profile ($name)', ({ target, wrapped, full: fullOf, profile: profileOf }) => {
  const full = fullOf();
  const profile = profileOf();

  it('is in the spelling it names', () => {
    if (wrapped) expect(Object.keys(full)).toContain('allOf');
  });

  it('names only ops the grammar has', () => {
    for (const op of MAPPING_OPS) expect(OP_KEYS).toContain(op);
    expect(opsOf(full)).toEqual(expect.arrayContaining([...MAPPING_OPS]));
  });

  it('documents exactly its ops', () => {
    expect(opsOf(profile)).toEqual([...MAPPING_OPS].sort());
  });

  it('keeps every alternative that is not an op, the plain-object key pattern included', () => {
    expect(otherAlternatives(profile)).toEqual(otherAlternatives(full));
    // The template branch still refuses EVERY op name as a key, documented or
    // not — wherever the draft can say so: draft-4 has no `propertyNames`.
    const refusesOps = (schema: Json): boolean => otherAlternatives(schema).some((alternative) => alternative.includes('walk'));
    expect(refusesOps(profile)).toBe(refusesOps(full));
    expect(refusesOps(full)).toBe(target !== 'draft-4');
  });

  it('leaves no dangling reference and no orphaned definition', () => {
    const refs = refsIn(profile, new Set());
    for (const ref of refs) expect(() => resolve(profile, ref)).not.toThrow();
    const [container, defs] = defsOf(profile);
    for (const name of Object.keys(defs)) expect(refs).toContain(`#/${container}/${name}`);
  });

  it('is smaller than the full schema', () => {
    expect(JSON.stringify(profile).length).toBeLessThan(JSON.stringify(full).length * 0.8);
  });

  it('does not change the schema it narrows', () => {
    const given = fullOf();
    const before = structuredClone(given);
    narrowConfigJsonSchema(given, MAPPING_OPS);
    expect(given).toEqual(before);
    expect(fullOf()).toEqual(full);
  });
});
