// A field a request declares as a prism expression over the row's own stored fields, beside the plain ones:
// [{ "close_date": "", "close_date_display": { "$date": { "value": { "$ref": "$.close_date" }, "format": "MMM D" } } }].
// The query returns the stored fields; the declared ones are computed from them by prism, never by a model.

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

const isExpression = (value: unknown): value is Record<string, unknown> => isRecord(value) && Object.keys(value).length === 1 && Object.keys(value)[0]?.startsWith('$') === true;

const templateOf = (shape: unknown): unknown => (Array.isArray(shape) ? shape[0] : shape);

// The stored fields an expression reads: "$.close_date" → close_date.
const readsOf = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(readsOf);
  if (!isRecord(value)) return [];
  const ref = value['$ref'];
  const own = typeof ref === 'string' && ref.startsWith('$.') ? [ref.slice(2).split('.')[0] ?? ''] : [];
  return [...own, ...Object.values(value).flatMap(readsOf)].filter((field) => field !== '');
};

// The fields of a flat row template: each plain field, and each declared one with what it reads. A nested shape is
// no flat template, and is mapped as before.
const fieldsOf = (shape: unknown): { plain: string[]; declared: [string, Record<string, unknown>][] } | undefined => {
  const template = templateOf(shape);
  if (!isRecord(template)) return undefined;
  const entries = Object.entries(template);
  if (entries.some(([, value]) => (isRecord(value) || Array.isArray(value)) && !isExpression(value))) return undefined;
  return {
    plain: entries.filter(([, value]) => !isExpression(value)).map(([key]) => key),
    declared: entries.filter((entry): entry is [string, Record<string, unknown>] => isExpression(entry[1])),
  };
};

// The shape the query is written for: the declared fields replaced by the stored fields they read.
export const storedShape = (shape: unknown): { shape: unknown; declared: boolean } => {
  const fields = fieldsOf(shape);
  if (fields === undefined || fields.declared.length === 0) return { shape, declared: false };
  const template = templateOf(shape) as Record<string, unknown>;
  const kept = Object.fromEntries(fields.plain.map((key) => [key, template[key]]));
  for (const [, expression] of fields.declared) for (const field of readsOf(expression)) if (!(field in kept)) kept[field] = '';
  return { shape: Array.isArray(shape) ? [kept] : kept, declared: true };
};

// A row's own field, read inside the mapping: "$.close_date" → the field of the row being mapped.
const onRow = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(onRow);
  if (!isRecord(value)) return value;
  const ref = value['$ref'];
  if (typeof ref === 'string' && ref.startsWith('$.') && Object.keys(value).length === 1) return { $get: { from: { $var: 'row' }, path: ref.slice(2).split('.'), fallback: null } };
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, onRow(inner)]));
};

// The mapping as a prism config over vex's envelope ({ result: rows }, or the first row for a single shape): plain
// fields copied, declared ones computed. Undefined for a shape that is not a flat row template.
export const declaredMapping = (shape: unknown): { config: object; reads: string[]; examples: Record<string, unknown> } | undefined => {
  const fields = fieldsOf(shape);
  if (fields === undefined) return undefined;
  const template = templateOf(shape) as Record<string, unknown>;
  const body = Object.fromEntries([
    ...fields.plain.map((key) => [key, { $get: { from: { $var: 'row' }, path: [key], fallback: null } }]),
    ...fields.declared.map(([key, expression]) => [key, onRow(expression)]),
  ]);
  const reads = [...new Set([...fields.plain, ...fields.declared.flatMap(([, expression]) => readsOf(expression))])];
  const config = Array.isArray(shape) ? { $map: { over: { $ref: '$.result' }, as: 'row', body } } : { $with: { let: { row: { $ref: '$.result' } }, value: body } };
  return { config, reads, examples: Object.fromEntries(fields.plain.map((key) => [key, template[key]])) };
};
