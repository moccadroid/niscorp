import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { placeable } from '../../app/action-catalog';
import { SCREENS } from '../../app/screens';
import type { Screen } from '../../app/screens';
import { recordOf } from './record';

type Placeable = { id: string; description: string; schema: Record<string, unknown>; check: z.ZodType; defaults: Record<string, unknown> };
export type Catalog = { actions: Placeable[] };

// An action that declares no input is opened with none.
const NO_INPUT = z.toJSONSchema(z.object({}).strict());

export const inputKeysOf = (schema: unknown): string[] => Object.keys(recordOf(recordOf(schema)['properties']));

const placeableOf = (action: ActionDefinition): Placeable => {
  const schema = action.input ?? NO_INPUT;
  const carried = inputKeysOf(schema);
  const defaults = Object.fromEntries(Object.entries(action.data ?? {}).filter(([key]) => carried.includes(key)));
  return { id: action.id, description: action.description ?? '', schema, check: z.fromJSONSchema(schema), defaults };
};

// A card written onto a screen holds its whole input: what it leaves out, or says is null, is its action's default, so a
// card already there is written into exactly as a new one would open, and keeps nothing of what it showed before.
export const opened = <C extends { action: string; input: Record<string, unknown> }>(card: C, catalog: Catalog): C => ({
  ...card,
  input: { ...catalog.actions.find((action) => action.id === card.action)?.defaults, ...Object.fromEntries(Object.entries(card.input).filter(([, value]) => value !== null)) },
});

export const CATALOG: Catalog = { actions: placeable.map(placeableOf) };

export const screensHeld = (actions: readonly string[]): Screen[] => SCREENS.filter((screen) => screen.cards.every((card) => actions.includes(card.action)));
