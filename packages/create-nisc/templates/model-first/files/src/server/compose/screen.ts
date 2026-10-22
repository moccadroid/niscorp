import type { Shell } from '@niscorp/nova';
import { AREAS } from '../../app/shell/areas';
import type { AreaId } from '../../app/shell/areas';
import { inputKeysOf } from './catalog';
import type { Plan } from './plan';
import { isRecord } from './record';

// The screen as it stands. A canvas's input is what it was opened with, and what the person pressed, ticked or typed
// into what its input carries; `shows` is the rest of its live data beyond what it was opened with — rows that loaded,
// a line being typed. A list there is its count and its first rows, ids left out: they are for the database, not for
// a person.
export type OpenCanvas = { area: AreaId; action: string; intent: string; input: Record<string, unknown>; shows: Record<string, unknown> };

const ROWS = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const withoutIds = (row: unknown): unknown => (isRecord(row) ? Object.fromEntries(Object.entries(row).filter(([, value]) => !(typeof value === 'string' && UUID.test(value)))) : row);

const summarised = (value: unknown): unknown => (Array.isArray(value) ? { count: value.length, first: value.slice(0, ROWS).map(withoutIds) } : value);

const isEmpty = (value: unknown): boolean => value === null || value === undefined || value === '' || value === false;

export const readOpenScreen = (shell: Shell, plan: Plan): OpenCanvas[] =>
  AREAS.flatMap((area) => {
    const placed = plan.canvases[area]?.[0];
    if (placed === undefined) return [];
    const active = shell.getState().canvases[area]?.active;
    const runtime = active === undefined ? undefined : shell.getRuntime(active.id);
    // While an answer streams in, an area can hold a card the plan does not list yet; the plan's card is read as placed.
    if (runtime === undefined || runtime.definition.id !== placed.action) return [{ area, ...placed, shows: {} }];
    const data = runtime.getData();
    const opened = { ...runtime.definition.data, ...placed.input };
    const carried = inputKeysOf(runtime.definition.input);
    const moved = Object.keys(data).filter((key) => JSON.stringify(data[key]) !== JSON.stringify(opened[key]));
    const input = { ...placed.input, ...Object.fromEntries(moved.filter((key) => carried.includes(key)).map((key) => [key, data[key]])) };
    const shows = Object.fromEntries(moved.filter((key) => !carried.includes(key) && !isEmpty(data[key])).map((key) => [key, summarised(data[key])]));
    return [{ area, action: placed.action, intent: placed.intent, input, shows }];
  });

export const canvasesStanding = (open: readonly OpenCanvas[]): Plan['canvases'] => Object.fromEntries(open.map(({ area, action, intent, input }) => [area, [{ action, input, intent }]]));
