import { describe, it, expect } from 'vitest';
import { createPglitePool } from '@niscorp/vex/pglite';
import { createTideStore } from '@niscorp/tide/postgres';
import { createDataLayer } from '../src/data/engine';
import { pristineDatabases } from './pristine-database';

const freshDatabase = pristineDatabases();

describe('the engine tables are not application data', () => {
  it('and they are ordinary tables — introspected, grantable, scopeable', async () => {
    const db = freshDatabase();
    const pool = createPglitePool(db);
    await createTideStore(pool).ready;
    await pool.query('CREATE TABLE IF NOT EXISTS members (id text PRIMARY KEY, name text)');

    const layer = await createDataLayer({ pool });

    expect(layer.schema.entities.map((entity) => entity.table)).toContain('tide_run');
    expect(layer.grants).toContain('tide_run.read');

    const runEntity = layer.schema.entities.find((entity) => entity.table === 'tide_run');
    expect(runEntity?.fields.map((field) => field.name)).toContain('as_who');
  });
});
