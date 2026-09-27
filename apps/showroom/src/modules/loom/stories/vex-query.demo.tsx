import { useMemo, type FC } from 'react';
import { LoomEditor, defaultPlugins } from '@niscorp/loom/react';
import { vex } from '@niscorp/loom/plugins/vex/react';
import { QuerySchema, type DatabaseSchema, type Query } from '@niscorp/vex';
import { useVexRuntime } from './use-vex-runtime';
import { Callout, INK, MONO, Panel } from '@showroom/chrome/stage/ui';
import { LoomStage } from '../demo-panel';

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
    return (
      <LoomStage>
        <Callout tone="warn" title="Starting the database">
          Booting Postgres in this tab (WASM) and seeding it — a few seconds on first load.
        </Callout>
      </LoomStage>
    );
  }

  return (
    <LoomStage>
      <SchemaPanel schema={runtime.schema} />
      <Panel title="A vex query in the editor" aside="the form is vex’s own QuerySchema; the preview runs it">
        <LoomEditor plugins={plugins} artifact={{ type: 'vex', documents: { query: INITIAL } }} />
      </Panel>
    </LoomStage>
  );
};

// The tables and columns in the database. The field-path widgets autocomplete
// against these. Read from the introspected schema.
const SchemaPanel: FC<{ schema: DatabaseSchema }> = ({ schema }) => (
  <details style={{ border: `1px solid ${INK.line}`, borderRadius: 14, padding: '10px 16px', background: '#ffffff' }}>
    <summary style={{ cursor: 'pointer', fontWeight: 650, fontSize: 13, color: INK.text }}>
      Querying an in-browser Postgres — {schema.entities.length} tables
    </summary>
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {schema.entities.map((entity) => (
        <div key={entity.name} style={{ fontFamily: MONO, fontSize: 12 }}>
          <span style={{ color: INK.accent, fontWeight: 600 }}>{entity.name}</span>
          <span style={{ color: INK.soft }}> ({entity.fields.map((field) => field.name).join(', ')})</span>
        </div>
      ))}
    </div>
  </details>
);
