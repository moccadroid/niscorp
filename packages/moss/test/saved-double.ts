import type { Who } from '../src/artifactory/running';
import type { SavedRows, SavedVersion } from '../src/artifactory/saves';

type Row = SavedVersion & { principal: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// What vex does for the artifactory on a database: `as` answers the rows of one
// caller, and every row written through it is that caller's.
export type RowsDouble = { rows: Row[]; asked: string[]; as: (principal: string) => SavedRows };

export const rowsDouble = (): RowsDouble => {
  const rows: Row[] = [];
  const asked: string[] = [];
  let saves = 0;
  const newestFirst = (one: Row, other: Row): number => other.createdAt.localeCompare(one.createdAt);
  return {
    rows,
    asked,
    as: (principal) => ({
      inForce: async () => {
        asked.push(principal);
        const latest = new Map<string, Row>();
        for (const row of rows.filter((held) => held.principal === principal).sort(newestFirst)) {
          const key = `${row.kind}\0${row.id}`;
          if (!latest.has(key)) latest.set(key, row);
        }
        return [...latest.values()];
      },
      history: async (kind, id, save) => {
        // As the column does: a save is a uuid, and Postgres refuses to compare it with anything else.
        if (save !== undefined && !UUID.test(save)) throw new Error(`invalid input syntax for type uuid: "${save}"`);
        return rows.filter((row) => row.principal === principal && row.kind === kind && row.id === id && (save === undefined || row.save === save)).sort(newestFirst);
      },
      write: async (save) => {
        saves += 1;
        const createdAt = new Date(Date.UTC(2026, 0, 1) + saves * 1000).toISOString();
        for (const version of save.versions) rows.push({ ...version, save: save.id, principal, createdAt });
      },
    }),
  };
};

export const noRows: SavedRows = { inForce: async () => [], history: async () => [], write: async () => undefined };

export const nobody = (roles: readonly string[], installed?: readonly string[]): Who => ({ principal: null, roles, installed });
