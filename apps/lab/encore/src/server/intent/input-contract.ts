import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';

// READING AN ACTION'S PUBLIC CONTRACT.
//
// `definition.input` is a JSON Schema and arrives typed as a bare record,
// because nova treats it as descriptive. The loop treats it as the source of
// its questions, so it is parsed here — once, at the boundary, into the handful
// of facts the lanes need — rather than poked at with casts in three places.
//
// `ref`, `parse`, `fallback`, `levels` and `write` are this app's `.meta()` conventions
// (see app/actions/shared/input-fields.ts). nova has no machine-readable way to
// say "this string is a row of that table"; PLAN.md lists it as a case.

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
  // A contract that does not parse is an authoring bug, and the honest reading
  // of it is "this card takes nothing": the card still mounts, unaimed, and
  // the boot check is where the bug gets caught.
  if (!parsed.success) return EMPTY;
  return {
    fields: Object.entries(parsed.data.properties ?? {}).map(([name, field]) => ({ ...field, name })),
    required: parsed.data.required ?? [],
  };
};

// Every table the principal's held actions can point a field at.
export const referencedTables = (definitions: readonly ActionDefinition[]): string[] => [
  ...new Set(definitions.flatMap((definition) => inputContractOf(definition).fields.flatMap((field) => (field.ref === undefined ? [] : [field.ref])))),
];
