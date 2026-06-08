import { z } from 'zod';

export const NormalizedTypeSchema = z.enum([
  'string', 'number', 'boolean', 'date', 'timestamp',
  'uuid', 'json', 'array', 'vector', 'unknown',
]);

export const FieldSchemaSchema = z.object({
  name: z.string(),
  type: z.string(),
  normalizedType: NormalizedTypeSchema,
  nullable: z.boolean(),
  primaryKey: z.boolean(),
  defaultValue: z.unknown().optional(),
  description: z.string().optional(),
  vectorDimensions: z.number().int().positive().optional(),
});

export const RelationSchemaSchema = z.object({
  type: z.enum(['hasOne', 'hasMany', 'belongsTo']),
  entity: z.string(),
  localField: z.string(),
  foreignField: z.string(),
});

export const IndexSchemaSchema = z.object({
  name: z.string(),
  fields: z.array(z.string()),
  unique: z.boolean(),
  type: z.enum(['btree', 'hash', 'gin', 'gist', 'ivfflat', 'hnsw', 'other']),
});

export const EntitySchemaSchema = z.object({
  name: z.string(),
  table: z.string(),
  description: z.string().optional(),
  fields: z.array(FieldSchemaSchema),
  relations: z.array(RelationSchemaSchema),
  indexes: z.array(IndexSchemaSchema),
  rowCount: z.number().optional(),
});

export const DatabaseSchemaSchema = z.object({
  entities: z.array(EntitySchemaSchema),
});

export type NormalizedType = z.infer<typeof NormalizedTypeSchema>;
export type FieldSchema = z.infer<typeof FieldSchemaSchema>;
export type RelationSchema = z.infer<typeof RelationSchemaSchema>;
export type IndexSchema = z.infer<typeof IndexSchemaSchema>;
export type EntitySchema = z.infer<typeof EntitySchemaSchema>;
export type DatabaseSchema = z.infer<typeof DatabaseSchemaSchema>;
