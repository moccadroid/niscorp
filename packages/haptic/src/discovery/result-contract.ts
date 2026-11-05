import { z } from 'zod';
import { ModelResultSchema } from './model-result.schema.js';
import type { Operation } from '../engine/contracts.js';
import { defineOperation } from '../engine/operation.js';
import {
  DiscoveryModelInputSchema,
  runDiscoveryModel,
  type ModelOperationOptions,
} from './model.js';
import { ResultContractDocumentationSchema } from './result-contract-documentation.js';
import { renderResultContractGuide } from './result-contract-guide.js';

type SchemaBody =
  | { type: 'string' | 'number' | 'integer' | 'boolean' | 'null'; description: string }
  | { type: 'array'; description: string; items: SchemaBody }
  | {
      type: 'object';
      description: string;
      properties: Record<string, SchemaBody>;
      required: string[];
      additionalProperties: boolean;
    }
  | { description: string; anyOf: SchemaBody[] };

const description = z.string().min(1).describe('Meaning of this requested value or field.');

/** Ordinary JSON Schema authoring vocabulary; the host attaches its fixed dialect in JSON. */
export const ResultSchemaBodySchema: z.ZodType<SchemaBody> = z.lazy(() =>
  z.union([
    z
      .object({
        type: z
          .enum(['string', 'number', 'integer', 'boolean', 'null'])
          .describe('Scalar value type.'),
        description,
      })
      .strict(),
    z
      .object({
        type: z.literal('array').describe('Ordered collection.'),
        description,
        items: ResultSchemaBodySchema.describe('Schema for each collection entry.'),
      })
      .strict(),
    z
      .object({
        type: z.literal('object').describe('Record with dynamically named fields.'),
        description,
        properties: z
          .record(z.string(), ResultSchemaBodySchema)
          .describe('Requested field names and their schemas.'),
        required: z
          .array(z.string())
          .describe(
            'Names of fields required by the instruction; other declared fields may be absent.',
          ),
        additionalProperties: z
          .boolean()
          .describe('Whether undeclared fields are part of the requested data.'),
      })
      .strict(),
    z
      .object({
        description,
        anyOf: z
          .array(ResultSchemaBodySchema)
          .min(1)
          .describe('Alternative value schemas, including an explicit null type when needed.'),
      })
      .strict(),
  ]),
);

export const createResultContractOperation = (options: ModelOperationOptions): Operation =>
  defineOperation({
    maxJsonDepth: options.maxJsonDepth,
    input: DiscoveryModelInputSchema.extend({ documentation: ResultContractDocumentationSchema }),
    output: ModelResultSchema,
    run(request, { signal }) {
      return runDiscoveryModel({
        ...options,
        request,
        schema: ResultSchemaBodySchema,
        doc: renderResultContractGuide(ResultSchemaBodySchema, request.documentation),
        signal,
      });
    },
  });
