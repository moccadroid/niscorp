import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { placeable } from '../../app/action-catalog';
import type { Card } from '../../app/screens';
import { recordOf } from './record';

type Placeable = { id: string; description: string; schema: Record<string, unknown>; check: z.ZodType; defaults: Record<string, unknown> };
export type Catalog = { actions: Placeable[] };

export const inputKeysOf = (schema: unknown): string[] => Object.keys(recordOf(recordOf(schema)['properties']));

// An action that declares no input is opened with none.
const NO_INPUT = z.toJSONSchema(z.object({}).strict());

const placeableOf = (action: ActionDefinition): Placeable => {
  const schema = action.input ?? NO_INPUT;
  const carried = inputKeysOf(schema);
  const defaults = Object.fromEntries(Object.entries(action.data ?? {}).filter(([key]) => carried.includes(key)));
  return { id: action.id, description: action.description ?? '', schema, check: z.fromJSONSchema(schema), defaults };
};

// A card is opened with its whole input: what the model leaves out, or says is null, is its action's default.
export const opened = (card: Card, catalog: Catalog): Card => ({
  ...card,
  input: { ...catalog.actions.find((action) => action.id === card.action)?.defaults, ...Object.fromEntries(Object.entries(card.input).filter(([, value]) => value !== null)) },
});

export const CATALOG: Catalog = { actions: placeable.map(placeableOf) };
