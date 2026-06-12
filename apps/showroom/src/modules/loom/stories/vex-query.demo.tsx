import { useMemo, type FC } from 'react';
import { LoomEditor, defaultPlugins } from '@niscorp/loom/react';
import { vex } from '@niscorp/loom/plugins/vex/react';
import { QuerySchema, type DatabaseSchema, type Query } from '@niscorp/vex';
import { useVexRuntime } from './use-vex-runtime';

// Loom editing a Vex query. The editor comes from Vex's QuerySchema; the vex
// plugin contributes the preview (which runs the query) and the field-path
// widgets. The engine (in-browser Postgres + seed data) is created in
// modules/vex/runtime/boot.ts; this file only wires it into Loom.

export const schema = QuerySchema;

const INITIAL: Query = {
  from: ['products'],
  fields: ['products.name', 'products.price', 'products.active'],
  filter: {
    and: [
      { eq: ['products.active', true] },
      { gt: ['products.price', 100] },
    ],
  },
  sort: [{ field: 'products.price', dir: 'desc' }],
};

export const Demo: FC = () => {
  const runtime = useVexRuntime();

  // Wire the engine into Loom: `run` runs a query (engine.test runs the pipeline —
  // resolve, analyze, SQL, execute — no LLM, up to 5 rows), `db` gives the
  // field-path widgets their column list. Default plugins first, then vex.
  const plugins = useMemo(
    () => (runtime ? [...defaultPlugins(), vex({ run: (q) => runtime.engine.test(q), db: runtime.schema })] : undefined),
    [runtime],
  );

  if (runtime === undefined || plugins === undefined) {
    return <div style={{ padding: 48, textAlign: 'center', color: '#6b7280' }}>Booting Postgres (WASM) + seeding data…</div>;
  }

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SchemaPanel schema={runtime.schema} />
      <LoomEditor plugins={plugins} artifact={{ type: 'vex', documents: { query: INITIAL } }} />
    </div>
  );
};

// The tables and columns in the database. The field-path widgets autocomplete
// against these. Read from the introspected schema.
const SchemaPanel: FC<{ schema: DatabaseSchema }> = ({ schema }) => (
  <details style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px' }}>
    <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13, color: '#374151' }}>
      Querying an in-browser Postgres — {schema.entities.length} tables
    </summary>
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {schema.entities.map((entity) => (
        <div key={entity.name} style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>
          <span style={{ color: '#4f46e5', fontWeight: 600 }}>{entity.name}</span>
          <span style={{ color: '#6b7280' }}> ({entity.fields.map((field) => field.name).join(', ')})</span>
        </div>
      ))}
    </div>
  </details>
);
