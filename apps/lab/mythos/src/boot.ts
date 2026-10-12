import { PGlite } from '@electric-sql/pglite';
import type { QueryEngine } from '@niscorp/vex';
import type { ComponentRegistry, Shell } from '@niscorp/nova';
import { SCHEMA_SQL } from './db/schema.sql';
import { SEED_SQL } from './db/seed.sql';
import { createVexEngine } from './vex/engine';
import { prewarmCache } from './vex/prewarm';
import { createApiFetch } from './api/routes';
import { createAppShell } from './nova/shell/create-shell';

export type App = {
  shell: Shell;
  registry: ComponentRegistry;
  db: PGlite;
  engine: QueryEngine;
  today: string;
};

export const boot = async (): Promise<App> => {
  const db = new PGlite();
  await db.exec(SCHEMA_SQL);
  await db.exec(SEED_SQL);

  const { engine, schema, cache } = await createVexEngine(db);
  await prewarmCache(cache, schema);

  const todayResult = await db.query<{ today: string }>('select current_date::text as today');
  const today = todayResult.rows[0]?.today;
  if (today === undefined) throw new Error('boot: could not read the reference date');

  const { shell, registry } = createAppShell({
    fetch: createApiFetch({ db, engine, today }),
    today,
  });

  return { shell, registry, db, engine, today };
};

let appPromise: Promise<App> | undefined;

export const getApp = (): Promise<App> => {
  appPromise ??= boot();
  return appPromise;
};
