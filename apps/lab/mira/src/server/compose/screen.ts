import type { Shell } from '@niscorp/nova';
import { AREAS } from '../../app/shell/areas';
import type { AreaId } from '../../app/shell/areas';
import type { Plan } from './plan';
import { isRecord } from './record';

// What a canvas's live data holds beyond its input: rows that loaded, what the person typed. A list is its count and
// its first rows, ids left out: they are for the database, not for a person.
export type OpenCanvas = { area: AreaId; action: string; intent: string; input: Record<string, unknown>; shows: Record<string, unknown> };

const ROWS = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const withoutIds = (row: unknown): unknown => (isRecord(row) ? Object.fromEntries(Object.entries(row).filter(([, value]) => !(typeof value === 'string' && UUID.test(value)))) : row);

const summarised = (value: unknown): unknown => (Array.isArray(value) ? { count: value.length, first: value.slice(0, ROWS).map(withoutIds) } : value);

const isEmpty = (value: unknown): boolean => value === null || value === undefined || value === '' || value === false;

export const readOpenScreen = (shell: Shell, plan: Plan): OpenCanvas[] =>
  AREAS.flatMap((area) => {
    const placed = plan.canvases[area]?.[0];
    const active = shell.getState().canvases[area]?.active;
    if (placed === undefined || active === undefined) return [];
    const data = shell.getRuntime(active.id)?.getData() ?? {};
    const shows = Object.fromEntries(
      Object.entries(data)
        .filter(([key, value]) => !isEmpty(value) && JSON.stringify(value) !== JSON.stringify(placed.input[key]))
        .map(([key, value]) => [key, summarised(value)]),
    );
    return [{ area, action: placed.action, intent: placed.intent, input: placed.input, shows }];
  });
