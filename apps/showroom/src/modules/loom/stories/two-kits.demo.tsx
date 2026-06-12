import type { CSSProperties } from 'react';
import { z } from 'zod';
import { Roles } from '@niscorp/loom';
import { LoomEditor, type LoomEditorPlugin } from '@niscorp/loom/react';
import { useNovaDispatch, type NovaComponent } from '@niscorp/nova/react';

// The resolver seam: one compiled definition (see the Definition tab),
// rendered through two different widget kits. The compiler only ever emits
// abstract roles; the registry supplies the bodies — so the same schema can
// look completely different without touching the compiler.

export const schema = z
  .object({
    name: z.string().meta({ title: 'Name' }),
    age: z.int().meta({ title: 'Age' }).optional(),
    subscribed: z.boolean().meta({ title: 'Subscribed' }).optional(),
  })
  .meta({ title: 'Profile' });

// An alternate kit: same roles, a dark "pill" look.
const pill: CSSProperties = {
  padding: '8px 14px',
  border: '1px solid #334155',
  borderRadius: 999,
  background: '#0f172a',
  color: '#e2e8f0',
  fontSize: 14,
};

const AltText: NovaComponent<{ value?: unknown }> = ({ value, novaModel }) => {
  const dispatch = useNovaDispatch();
  return (
    <input
      value={String(value ?? '')}
      onChange={(e) => novaModel && dispatch({ type: 'ui:model', ref: novaModel.ref, payload: e.target.value })}
      style={pill}
    />
  );
};

const AltNumber: NovaComponent<{ value?: unknown }> = ({ value, novaModel }) => {
  const dispatch = useNovaDispatch();
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? (value as number) : ''}
      onChange={(e) =>
        novaModel && dispatch({ type: 'ui:model', ref: novaModel.ref, payload: e.target.value ? Number(e.target.value) : null })
      }
      style={pill}
    />
  );
};

const AltCheckbox: NovaComponent<{ value?: unknown }> = ({ value, novaModel }) => {
  const dispatch = useNovaDispatch();
  return (
    <button
      type="button"
      onClick={() => novaModel && dispatch({ type: 'ui:model', ref: novaModel.ref, payload: !value })}
      style={{ ...pill, cursor: 'pointer' }}
    >
      {value ? '● on' : '○ off'}
    </button>
  );
};

const altKit = {
  [Roles.text]: AltText,
  [Roles.number]: AltNumber,
  [Roles.checkbox]: AltCheckbox,
};

const demoPlugin = (components?: typeof altKit): LoomEditorPlugin => ({ name: 'demo', documents: { value: schema }, ...(components ? { components } : {}) });

const column = { flex: '1 1 280px', minWidth: 260 } as const;
const heading = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6b7280', marginBottom: 12 } as const;

export const Demo = () => (
  <div style={{ display: 'flex', gap: 32, padding: 24, flexWrap: 'wrap' }}>
    <div style={column}>
      <div style={heading}>Default kit</div>
      <LoomEditor plugins={[demoPlugin()]} artifact={{ type: 'demo' }} />
    </div>
    <div style={column}>
      <div style={heading}>Alternate kit</div>
      <LoomEditor plugins={[demoPlugin(altKit)]} artifact={{ type: 'demo' }} />
    </div>
  </div>
);
