import type { Shell } from '@niscorp/nova';
import { AREAS } from '../../app/shell/areas';
import type { AreaId } from '../../app/shell/areas';
import type { Unnumbered } from './plan';

// A canvas as it stands when a message arrives: what was placed there, and what its live data holds beyond its input —
// rows that loaded, what the person typed into it. A list is its count and its first rows, ids left out: they are for
// the database, not for a person.
export type OpenCanvas = { area: AreaId; action: string; intent: string; input: Record<string, unknown>; shows: Record<string, unknown> };

const ROWS = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const withoutIds = (row: unknown): unknown =>
  row !== null && typeof row === 'object' && !Array.isArray(row) ? Object.fromEntries(Object.entries(row).filter(([, value]) => !(typeof value === 'string' && UUID.test(value)))) : row;

const summaryOf = (value: unknown): unknown => (Array.isArray(value) ? { count: value.length, first: value.slice(0, ROWS).map(withoutIds) } : value);

const empty = (value: unknown): boolean => value === null || value === undefined || value === '' || value === false;

export const openScreen = (shell: Shell, plan: Unnumbered): OpenCanvas[] =>
  AREAS.flatMap((area) => {
    const placed = plan.canvases[area]?.[0];
    const active = shell.getState().canvases[area]?.active;
    if (placed === undefined || active === undefined) return [];
    const data = shell.getRuntime(active.id)?.getData() ?? {};
    const shows = Object.fromEntries(
      Object.entries(data)
        .filter(([key, value]) => !empty(value) && JSON.stringify(value) !== JSON.stringify(placed.input[key]))
        .map(([key, value]) => [key, summaryOf(value)]),
    );
    return [{ area, action: placed.action, intent: placed.intent, input: placed.input, shows }];
  });
