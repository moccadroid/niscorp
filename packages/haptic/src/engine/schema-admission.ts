import type { JsonObject, JsonValue } from './contracts.js';
import { ArtifactError } from './errors.js';
const isObject = (value: JsonValue | undefined): value is JsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const maps = [
  '$defs',
  'definitions',
  'properties',
  'patternProperties',
  'dependentSchemas',
  'dependencies',
];
const single = [
  'items',
  'additionalProperties',
  'additionalItems',
  'contains',
  'propertyNames',
  'not',
  'if',
  'then',
  'else',
  'unevaluatedProperties',
  'unevaluatedItems',
  'contentSchema',
];
const lists = ['allOf', 'anyOf', 'oneOf', 'prefixItems'];
const isSchemaPointer = (pointer: string): boolean => {
  const tokens = pointer.slice(1).split('/');
  for (let index = 0; index < tokens.length;) {
    const keyword = tokens[index++];
    if (keyword === undefined) return false;
    if (single.includes(keyword)) continue;
    const isList = lists.includes(keyword);
    if (!isList && !maps.includes(keyword)) return false;
    const key = tokens[index++];
    if (key === undefined || (isList && !/^(0|[1-9][0-9]*)$/.test(key))) return false;
  }
  return true;
};
const admitReference = (reference: JsonValue | undefined, path: string): void => {
  if (typeof reference !== 'string') return;
  const hash = reference.indexOf('#');
  if (hash < 0) return;
  const fragment = decodeURIComponent(reference.slice(hash + 1));
  if (fragment.startsWith('/') && !isSchemaPointer(fragment)) {
    throw new ArtifactError(
      'INVALID_SCHEMA',
      'References outside declared JSON Schema positions are unavailable',
      path,
    );
  }
};
// Walk schema positions only. const/enum/default/examples are literal data.
export const assertSupportedSchema = (schema: JsonValue, path = '$'): void => {
  if (!isObject(schema)) return;
  admitReference(schema.$ref, path + '/$ref');
  admitReference(schema.$dynamicRef, path + '/$dynamicRef');
  for (const keyword of ['properties', 'patternProperties']) {
    const entries = schema[keyword];
    if (isObject(entries) && Object.hasOwn(entries, '__proto__')) {
      throw new ArtifactError(
        'INVALID_SCHEMA',
        'The schema validator does not enforce the __proto__ entry of ' + keyword,
        path + '/' + keyword,
      );
    }
  }
  for (const keyword of maps) {
    const entries = schema[keyword];
    if (isObject(entries)) {
      for (const [name, child] of Object.entries(entries)) {
        assertSupportedSchema(child, path + '/' + keyword + '/' + name);
      }
    }
  }
  for (const keyword of single) {
    const child = schema[keyword];
    if (child !== undefined) assertSupportedSchema(child, path + '/' + keyword);
  }
  for (const keyword of lists) {
    const children = schema[keyword];
    if (Array.isArray(children)) {
      for (const [index, child] of children.entries()) {
        assertSupportedSchema(child, path + '/' + keyword + '/' + index);
      }
    }
  }
};
