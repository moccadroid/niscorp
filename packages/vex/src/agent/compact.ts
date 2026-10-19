import type { DatabaseSchema } from '../schemas/database.schema.js';

// What the query agent reads, written as text rather than JSON: the same entities, fields, keys and rules in
// fewer tokens. The query it writes is still validated against the full DSL schema.

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

export const compactSchema = (schema: DatabaseSchema): string =>
  schema.entities
    .map((entity) => {
      const fields = entity.fields.map((field) => `${field.name} ${field.type}${field.primaryKey ? ' key' : ''}${field.nullable ? ' null' : ''}`);
      const relations = entity.relations.map((relation) => `${relation.type} ${relation.entity} (${relation.localFields.join(', ')} = ${relation.entity}.${relation.foreignFields.join(', ')})`);
      const indexed = entity.indexes.filter((index) => !(index.unique && index.fields.length === 1 && entity.fields.some((field) => field.primaryKey && field.name === index.fields[0])));
      return [
        `${entity.name}${entity.table === entity.name ? '' : ` (table ${entity.table})`}: ${fields.join(', ')}`,
        ...(relations.length > 0 ? [`  relations: ${relations.join('; ')}`] : []),
        ...(indexed.length > 0 ? [`  indexed: ${indexed.map((index) => `${index.fields.join('+')}${index.unique ? ' unique' : ''}`).join(', ')}`] : []),
      ].join('\n');
    })
    .join('\n');

// "#/definitions/__schema14" → "D14".
const nameOf = (ref: string): string => ref.replace(/^#\/definitions\/(?:__schema)?/, 'D');

const noteOf = (node: Record<string, unknown>): string => {
  const limits = ['minItems', 'maxItems', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minLength', 'maxLength', 'pattern', 'format', 'default']
    .filter((key) => key in node)
    .map((key) => `${key} ${JSON.stringify(node[key])}`);
  return limits.length > 0 ? ` (${limits.join(', ')})` : '';
};

const describedOf = (node: unknown): string => (isRecord(node) && typeof node['description'] === 'string' ? ` /* ${node['description']} */` : '');

const SPELLED = new Set(['$ref', 'anyOf', 'oneOf', 'allOf', 'enum', 'const', 'type', 'items', 'properties', 'required', 'additionalProperties', 'description', 'minItems', 'maxItems', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minLength', 'maxLength', 'pattern', 'format', 'default', '$schema']);

// A node as text, its own description beside it wherever it sits. A keyword this writer does not spell out keeps
// its JSON, so nothing the schema says is dropped.
const typeOf = (node: unknown, indent: string): string =>
  isRecord(node) && !Object.keys(node).some((key) => !SPELLED.has(key)) ? `${shapeOf(node, indent)}${describedOf(node)}` : JSON.stringify(node);

const shapeOf = (node: Record<string, unknown>, indent: string): string => {
  if (typeof node['$ref'] === 'string') return nameOf(node['$ref']);
  const alternatives = node['anyOf'] ?? node['oneOf'];
  if (Array.isArray(alternatives)) {
    if (!alternatives.some((alternative) => describedOf(alternative) !== '')) return alternatives.map((alternative) => typeOf(alternative, indent)).join(' | ');
    return alternatives.map((alternative) => `\n${indent}  | ${typeOf(alternative, `${indent}  `)}`).join('');
  }
  if (Array.isArray(node['allOf'])) return node['allOf'].map((part) => typeOf(part, indent)).join(' & ');
  if (Array.isArray(node['enum'])) return node['enum'].map((value) => JSON.stringify(value)).join(' | ');
  if ('const' in node) return JSON.stringify(node['const']);
  const kind = node['type'];
  if (kind === 'array') {
    const item = typeOf(node['items'], indent);
    return `${/[ |&]/.test(item) ? `(${item})` : item}[]${noteOf(node)}`;
  }
  if (kind === 'object' || isRecord(node['properties'])) {
    const required = new Set(Array.isArray(node['required']) ? node['required'] : []);
    const properties = Object.entries(isRecord(node['properties']) ? node['properties'] : {}).map(
      ([key, value]) => `${key}${required.has(key) ? '' : '?'}: ${typeOf(value, indent)}`,
    );
    const rest = isRecord(node['additionalProperties']) ? [`[key: string]: ${typeOf(node['additionalProperties'], indent)}`] : [];
    return `{ ${[...properties, ...rest].join(', ')} }`;
  }
  if (Array.isArray(kind)) return kind.join(' | ');
  if (typeof kind === 'string') return `${kind}${noteOf(node)}`;
  return JSON.stringify(node);
};

export const compactSpec = (jsonSchema: object): string => {
  const root = jsonSchema as Record<string, unknown>;
  const definitions = isRecord(root['definitions']) ? root['definitions'] : {};
  const number = (name: string): number => Number(name.replace(/\D/g, '')) || 0;
  return [
    'The query is one JSON object of type Query; every Dn is defined below. "a?: T" is optional, "A | B" is either.',
    `Query = ${typeOf({ type: 'object', properties: root['properties'], required: root['required'] }, '')}`,
    ...Object.entries(definitions)
      .sort(([a], [b]) => number(a) - number(b))
      .map(([name, node]) => `${nameOf(`#/definitions/${name}`)} = ${typeOf(node, '')}`),
  ].join('\n');
};
