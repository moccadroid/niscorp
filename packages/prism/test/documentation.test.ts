import { describe, it, expect } from 'vitest';
import { getConfigJsonSchema, getNodeJsonSchema } from '../src';

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

type SchemaObj = Record<string, unknown>;

/** Recursively collect all property names from the schema (including inside anyOf, $defs, etc.) */
const collectPropertyNames = (schema: SchemaObj): Set<string> => {
  const names = new Set<string>();
  const walk = (obj: unknown): void => {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) { obj.forEach(walk); return; }
    const rec = obj as SchemaObj;
    if (rec['properties'] && typeof rec['properties'] === 'object') {
      for (const key of Object.keys(rec['properties'] as object)) names.add(key);
    }
    for (const value of Object.values(rec)) walk(value);
  };
  walk(schema);
  return names;
};

/** Recursively collect all description strings */
const collectDescriptions = (schema: SchemaObj): string[] => {
  const descs: string[] = [];
  const walk = (obj: unknown): void => {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) { obj.forEach(walk); return; }
    const rec = obj as SchemaObj;
    if (typeof rec['description'] === 'string') descs.push(rec['description']);
    for (const value of Object.values(rec)) walk(value);
  };
  walk(schema);
  return descs;
};

/** Check if schema contains a $ref: "#" or similar self-reference (proves recursion works) */
const containsSelfRef = (schema: SchemaObj): boolean => {
  const str = JSON.stringify(schema);
  return str.includes('"$ref":"#"') || str.includes('"$ref":"#/');
};

// ═══════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════

describe('JSON Schema generation', () => {
  const nodeSchema = getNodeJsonSchema() as SchemaObj;
  const configSchema = getConfigJsonSchema() as SchemaObj;

  it('generates non-empty schemas', () => {
    const nodeStr = JSON.stringify(nodeSchema);
    const configStr = JSON.stringify(configSchema);
    expect(nodeStr.length).toBeGreaterThan(1000);
    expect(configStr.length).toBeGreaterThan(1000);
  });

  it('includes $schema field', () => {
    expect(nodeSchema['$schema']).toContain('json-schema.org');
  });

  it('uses anyOf for the union', () => {
    expect(nodeSchema['anyOf']).toBeDefined();
    expect(Array.isArray(nodeSchema['anyOf'])).toBe(true);
    expect((nodeSchema['anyOf'] as unknown[]).length).toBeGreaterThan(10);
  });

  it('handles recursion via $ref', () => {
    expect(containsSelfRef(nodeSchema)).toBe(true);
  });

  // ─────────────────────────────────────────────────────────
  // Every op should appear as a property name in the schema
  // ─────────────────────────────────────────────────────────

  const allOpKeys = [
    // Core
    '$ref', '$const', '$var', '$get', '$with',
    // Array
    '$map', '$filter', '$reduce', '$slice', '$flatten', '$unique', '$sortBy',
    // Math
    '$add', '$sub', '$mul', '$div', '$round',
    // String
    '$join', '$toString', '$interpolate', '$trim', '$lower', '$upper', '$split', '$replace',
    // Predicate
    '$eq', '$neq', '$gt', '$gte', '$lt', '$lte', '$empty', '$startsWith', '$endsWith', '$contains',
    // Logic
    '$not', '$and', '$or',
    // Structure
    '$merge', '$coalesce', '$case', '$entriesOf', '$keyBy', '$groupBy',
    // Object
    '$keys', '$values', '$fromEntries', '$pick', '$omit', '$type', '$length',
    // Time
    '$date', '$dateAdd', '$dateDiff',
    // Sugar
    '$sum', '$avg', '$count', '$min', '$max', '$pluck', '$take', '$drop', '$match', '$flatMap',
  ];

  const propertyNames = collectPropertyNames(nodeSchema);

  it.each(allOpKeys)('schema contains op %s', (op) => {
    expect(propertyNames.has(op)).toBe(true);
  });

  // ─────────────────────────────────────────────────────────
  // Descriptions should be present and meaningful
  // ─────────────────────────────────────────────────────────

  const descriptions = collectDescriptions(nodeSchema);

  it('has many descriptions (one per op + fields)', () => {
    // At minimum, each op schema has a description + most fields have descriptions
    expect(descriptions.length).toBeGreaterThan(50);
  });

  it('descriptions mention key concepts', () => {
    const allDescs = descriptions.join(' ');
    expect(allDescs).toContain('JSONPath');
    expect(allDescs).toContain('array');
    expect(allDescs).toContain('object');
    expect(allDescs).toContain('accumulator');
    expect(allDescs).toContain('variable');
    expect(allDescs).toContain('separator');
  });

  // ─────────────────────────────────────────────────────────
  // Structural checks on specific ops
  // ─────────────────────────────────────────────────────────

  const anyOfEntries = nodeSchema['anyOf'] as SchemaObj[];

  const findOpEntry = (opKey: string): SchemaObj | undefined =>
    anyOfEntries.find((entry) => {
      const props = entry['properties'] as SchemaObj | undefined;
      return props && opKey in props;
    });

  it('$ref entry has string type with pattern', () => {
    const entry = findOpEntry('$ref');
    expect(entry).toBeDefined();
    const refProp = (entry!['properties'] as SchemaObj)['$ref'] as SchemaObj;
    expect(refProp['type']).toBe('string');
    expect(refProp['pattern']).toBeDefined();
  });

  it('$map entry has over/as/body properties', () => {
    const entry = findOpEntry('$map');
    expect(entry).toBeDefined();
    const mapProp = (entry!['properties'] as SchemaObj)['$map'] as SchemaObj;
    const innerProps = mapProp['properties'] as SchemaObj;
    expect(innerProps).toBeDefined();
    expect('over' in innerProps).toBe(true);
    expect('as' in innerProps).toBe(true);
    expect('body' in innerProps).toBe(true);
  });

  it('$add entry has tuple/array for pair', () => {
    const entry = findOpEntry('$add');
    expect(entry).toBeDefined();
    const addProp = (entry!['properties'] as SchemaObj)['$add'] as SchemaObj;
    // Should be a tuple (prefixItems) or array
    const isTuple = 'prefixItems' in addProp;
    const isArray = addProp['type'] === 'array';
    expect(isTuple || isArray).toBe(true);
  });

  it('$case entry has branches and optional else', () => {
    const entry = findOpEntry('$case');
    expect(entry).toBeDefined();
    const caseProp = (entry!['properties'] as SchemaObj)['$case'] as SchemaObj;
    const innerProps = caseProp['properties'] as SchemaObj;
    expect(innerProps).toBeDefined();
    expect('branches' in innerProps).toBe(true);
  });

  it('$with entry has let and value', () => {
    const entry = findOpEntry('$with');
    expect(entry).toBeDefined();
    const withProp = (entry!['properties'] as SchemaObj)['$with'] as SchemaObj;
    const innerProps = withProp['properties'] as SchemaObj;
    expect(innerProps).toBeDefined();
    expect('let' in innerProps).toBe(true);
    expect('value' in innerProps).toBe(true);
  });

  it('all op entries have additionalProperties: false', () => {
    const opEntries = allOpKeys
      .map((key) => ({ key, entry: findOpEntry(key) }))
      .filter((e) => e.entry);

    for (const { key, entry } of opEntries) {
      expect(entry!['additionalProperties'], `${key} should have additionalProperties: false`).toBe(false);
    }
  });
});
