import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { CANVAS_PLACEMENT } from '@encore/app/canvas-placement';
import { inputContractOf } from '@encore/server/intent/input-contract';
import type { InputField } from '@encore/server/intent/input-contract';
import type { CandidateSets, Entity } from '@encore/server/intent/intent.types';

export const PREDECISIONS_HEADING = 'THIS TURN — decided before you were called (JSON):';

export const PredecisionsSchema = z.object({
  sentence: z.string(),
  heard: z.record(z.string(), z.union([z.string(), z.number()])),
  now: z.object({ day: z.string(), time: z.string() }),
  resolved: z.array(z.object({ table: z.string(), id: z.string(), label: z.string() })),
  rows: z.record(z.string(), z.array(z.string())),
  actions: z.array(z.string()),
  facts: z.record(z.string(), z.unknown()),
  screen: z.array(z.object({ canvas: z.string(), card: z.string(), aimedAt: z.record(z.string(), z.unknown()) })),
  writable: z.array(z.object({ card: z.string(), field: z.string(), for: z.string(), holds: z.string() })),
  wanted: z.array(z.string()).default([]),
  asked: z.array(z.string()).default([]),
});

export type Predecisions = z.infer<typeof PredecisionsSchema>;

const shapeOf = (field: InputField): string => {
  if (field.ref !== undefined) return `row:${field.ref}`;
  if (field.enum !== undefined) return field.enum.join('|');
  if (field.type === 'boolean') return 'true|false';
  if (field.minimum !== undefined && field.maximum !== undefined) return `${field.minimum}-${field.maximum}`;
  if (field.parse === 'time') return 'HH:MM';
  return field.type ?? 'text';
};

export const actionLine = (definition: ActionDefinition): string => {
  const contract = inputContractOf(definition);
  const keys = contract.fields.map((field) => `${field.name}${contract.required.includes(field.name) ? '*' : ''}(${shapeOf(field)})`);
  return `${definition.id} [${CANVAS_PLACEMENT[definition.id] ?? 'nowhere'}] ${definition.title ?? definition.id} — ${definition.description ?? ''}${keys.length === 0 ? '' : ` · input: ${keys.join(', ')}`}`;
};

export const rowLines = (candidates: CandidateSets): Record<string, string[]> => Object.fromEntries(Object.entries(candidates).filter(([, rows]) => rows.length > 0).map(([table, rows]) => [table, rows.map((row) => `${row.id} = ${row.label}`)]));

export const resolvedRows = (entities: readonly Entity[]): Predecisions['resolved'] => entities.map((entity) => ({ table: entity.table, id: entity.id, label: entity.label }));

export const predecisionsBlock = (predecisions: Predecisions): string => `${PREDECISIONS_HEADING}\n${JSON.stringify(predecisions)}`;

export const predecisionsIn = (content: string): Predecisions | undefined => {
  if (!content.startsWith(PREDECISIONS_HEADING)) return undefined;
  try {
    const parsed = PredecisionsSchema.safeParse(JSON.parse(content.slice(PREDECISIONS_HEADING.length)));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
};
