import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';

const FieldSchema = z
  .object({
    type: z.string().optional(),
    description: z.string().optional(),
    enum: z.array(z.string()).optional(),
    minimum: z.number().optional(),
    maximum: z.number().optional(),
    ref: z.string().optional(),
    parse: z.string().optional(),
    fallback: z.string().optional(),
    levels: z.array(z.string()).optional(),
    write: z.boolean().optional(),
  })
  .loose();

const ContractSchema = z
  .object({
    properties: z.record(z.string(), FieldSchema).optional(),
    required: z.array(z.string()).optional(),
  })
  .loose();

export type InputField = z.infer<typeof FieldSchema> & { name: string };

export type InputContract = { fields: InputField[]; required: string[] };

const EMPTY: InputContract = { fields: [], required: [] };

export const inputContractOf = (definition: ActionDefinition): InputContract => {
  if (definition.input === undefined) return EMPTY;
  const parsed = ContractSchema.safeParse(definition.input);
  // An authoring bug, caught by the boot check: the card still mounts, unaimed.
  if (!parsed.success) return EMPTY;
  return {
    fields: Object.entries(parsed.data.properties ?? {}).map(([name, field]) => ({ ...field, name })),
    required: parsed.data.required ?? [],
  };
};

export const referencedTables = (definitions: readonly ActionDefinition[]): string[] => [
  ...new Set(definitions.flatMap((definition) => inputContractOf(definition).fields.flatMap((field) => (field.ref === undefined ? [] : [field.ref])))),
];
