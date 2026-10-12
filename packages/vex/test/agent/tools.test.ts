import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createQueryTools } from '../../src/agent/tools.js';
import { QuerySchema } from '../../src/schemas/query.schema.js';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const propertiesOf = (schema: unknown): string[] => (isRecord(schema) && isRecord(schema['properties']) ? Object.keys(schema['properties']).sort() : []);

describe('testQuery parameters', () => {
  const tools = createQueryTools({ getSchema: () => undefined, read: () => Promise.reject(new Error('no reads here')) });
  const testQuery = tools.find((tool) => tool.config.id === 'testQuery');

  it('name exactly the top-level keys of the query DSL', () => {
    expect(testQuery).toBeDefined();
    const wire = z.toJSONSchema(testQuery?.config.input ?? z.never());
    expect(propertiesOf(wire)).toEqual(propertiesOf(z.toJSONSchema(QuerySchema)));
  });

  it('require `from`, the one key every query has', () => {
    const wire = z.toJSONSchema(testQuery?.config.input ?? z.never());
    expect(isRecord(wire) ? wire['required'] : undefined).toEqual(['from']);
  });
});
