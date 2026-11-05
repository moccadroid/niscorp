import { z } from 'zod';
import type { ResultContractDocumentation } from './result-contract-documentation.js';

type Schema = z.core.JSONSchema.JSONSchema;
type SchemaValue = z.core.JSONSchema._JSONSchema;

const supportedKeys = new Set([
  '$ref',
  'description',
  'type',
  'const',
  'enum',
  'minLength',
  'minItems',
  'items',
  'properties',
  'propertyNames',
  'required',
  'additionalProperties',
]);

/** Render this authoring grammar's forms, not a JSON Schema describing those forms. */
export const renderResultContractGuide = (
  schema: z.ZodType,
  documentation: ResultContractDocumentation,
): string => {
  const exported = z.toJSONSchema(schema);
  const reference = exported.$ref;
  const root = reference?.startsWith('#/$defs/')
    ? exported.$defs?.[
        reference.slice('#/$defs/'.length).replaceAll('~1', '/').replaceAll('~0', '~')
      ]
    : exported;
  if (!root?.anyOf?.length) throw new Error('SCHEMA_AUTHORING_GUIDE: expected a union of forms');

  const render = (value: SchemaValue | undefined): string => {
    if (value === undefined || typeof value === 'boolean')
      throw new Error('SCHEMA_AUTHORING_GUIDE: unsupported form value');
    const unsupported = Object.keys(value).find((key) => !supportedKeys.has(key));
    if (unsupported) throw new Error(`SCHEMA_AUTHORING_GUIDE: unsupported keyword ${unsupported}`);
    if (value.$ref === '#' || (reference !== undefined && value.$ref === reference))
      return documentation.node;
    if (value.const !== undefined) return JSON.stringify(value.const);
    if (value.enum) return value.enum.map((item) => JSON.stringify(item)).join(' | ');
    if (value.type === 'string')
      return 'string' + (value.minLength === undefined ? '' : `(minLength=${value.minLength})`);
    if (value.type === 'boolean') return 'boolean';
    if (value.type === 'array') {
      if (Array.isArray(value.items))
        throw new Error('SCHEMA_AUTHORING_GUIDE: tuple forms are unsupported');
      return (
        `array<${render(value.items)}>` +
        (value.minItems === undefined ? '' : `(minItems=${value.minItems})`)
      );
    }
    if (value.type === 'object') {
      if (value.properties)
        return (
          '{' +
          Object.entries(value.properties)
            .map(
              ([name, child]) =>
                `${JSON.stringify(name)}${value.required?.includes(name) ? '' : '?'}:${render(child)}`,
            )
            .join(',') +
          '}'
        );
      if (value.additionalProperties && typeof value.additionalProperties === 'object') {
        if (
          value.propertyNames &&
          (typeof value.propertyNames === 'boolean' ||
            value.propertyNames.type !== 'string' ||
            Object.keys(value.propertyNames).some((key) => key !== 'type'))
        )
          throw new Error('SCHEMA_AUTHORING_GUIDE: constrained dynamic names are unsupported');
        return `{${documentation.field}:${render(value.additionalProperties)}}`;
      }
    }
    throw new Error('SCHEMA_AUTHORING_GUIDE: unsupported form value');
  };

  const forms = root.anyOf.map((form: Schema) => {
    if (form.type !== 'object' || !form.properties || form.additionalProperties !== false)
      throw new Error('SCHEMA_AUTHORING_GUIDE: expected a closed object form');
    const descriptions = Object.entries(form.properties).flatMap(([name, value]) =>
      typeof value === 'object' && value.description
        ? [`${JSON.stringify(name)}: ${value.description}`]
        : [],
    );
    return `${documentation.node} := ${render(form)}\n${descriptions.join('\n')}`;
  });
  return [documentation.heading, documentation.introduction, ...forms].join('\n\n');
};
