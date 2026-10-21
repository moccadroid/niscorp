import type { Shell } from '@niscorp/nova';
import { AREAS } from '../../app/shell/areas';
import type { AreaId } from '../../app/shell/areas';
import type { Unnumbered } from './plan';

// A canvas as it stands when a message arrives: what was placed there, and what its live data holds beyond its input —
// rows that loaded, what the person typed into it. A list is its count, the keys of a row, and its first rows.
export type OpenCanvas = { area: AreaId; action: string; intent: string; input: Record<string, unknown>; holds: Record<string, unknown> };

const ROWS = 3;

const summaryOf = (value: unknown): unknown => {
  if (!Array.isArray(value)) return value;
  const first: unknown = value[0];
  return { count: value.length, keys: first !== null && typeof first === 'object' ? Object.keys(first) : [], rows: value.slice(0, ROWS) };
};

const empty = (value: unknown): boolean => value === null || value === undefined || value === '' || value === false;

export const openScreen = (shell: Shell, plan: Unnumbered): OpenCanvas[] =>
  AREAS.flatMap((area) => {
    const placed = plan.canvases[area]?.[0];
    const active = shell.getState().canvases[area]?.active;
    if (placed === undefined || active === undefined) return [];
    const data = shell.getRuntime(active.id)?.getData() ?? {};
    const holds = Object.fromEntries(
      Object.entries(data)
        .filter(([key, value]) => !empty(value) && JSON.stringify(value) !== JSON.stringify(placed.input[key]))
        .map(([key, value]) => [key, summaryOf(value)]),
    );
    return [{ area, action: placed.action, intent: placed.intent, input: placed.input, holds }];
  });
