import type { CSSProperties } from 'react';
import { z } from 'zod';
import { mountView } from '@niscorp/loom';
import { useModelWrite, type LoomEditorPlugin, type FieldContext } from '@niscorp/loom/react';
import type { NovaComponent } from '@niscorp/nova/adapters/react';

// gradient is an example Loom plugin. It edits a gradient (a name, an angle, a
// list of colours) and previews it. A complete plugin in one file: a document
// (the schema Loom compiles to a form), a widget (a colour input for each
// colour), a mount (the preview canvas), and the components those reference.

// ─── the document: what you edit ────────────────────────────
const gradientSchema = z.object({
  name: z.string().meta({ title: 'Name' }),
  angle: z.number().min(0).max(360).meta({ title: 'Angle' }),
  colors: z.array(z.string()).meta({ title: 'Colours' }),
});

// ─── roles: names the layouts reference, filled by components ─
const PREVIEW = 'gradient:preview';
const SWATCH = 'gradient:swatch';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// ─── the preview: renders the gradient from the live document ─
const Preview: NovaComponent<{ gradient?: unknown }> = ({ gradient: g }) => {
  const spec = isRecord(g) ? g : {};
  const colors = Array.isArray(spec['colors']) ? (spec['colors'] as string[]) : [];
  const angle = typeof spec['angle'] === 'number' ? spec['angle'] : 90;
  const style: CSSProperties = {
    height: 220,
    borderRadius: 14,
    border: '1px solid #e5e7eb',
    background: colors.length > 0 ? `linear-gradient(${angle}deg, ${colors.join(', ')})` : '#f3f4f6',
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={style} />
      <div style={{ fontSize: 12, color: '#6b7280' }}>{typeof spec['name'] === 'string' ? spec['name'] : ''}</div>
    </div>
  );
};

// the preview canvas's action: the preview layout over a `gradient` slot the
// mount keeps in sync with the live document.
const previewAction = {
  id: PREVIEW,
  layout: { component: PREVIEW, props: { gradient: '$.gradient' } },
  data: { gradient: {} },
};

// ─── the widget: a colour input, for each item of `colors` ───
const Swatch: NovaComponent<{ value?: unknown }> = ({ value, novaModel }) => {
  const set = useModelWrite(novaModel);
  const color = typeof value === 'string' ? value : '#000000';
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input type="color" value={color} onChange={(e) => set(e.target.value)} style={{ width: 44, height: 30, padding: 0, border: '1px solid #d1d5db', borderRadius: 6 }} />
      <input value={color} onChange={(e) => set(e.target.value)} style={{ flex: 1, padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontFamily: 'ui-monospace, monospace', fontSize: 13 }} />
    </div>
  );
};

// claim each item of the `colors` array (path tail `colors.*`).
const isColor = (field: FieldContext): boolean => field.kind === 'string' && /(^|\.)colors\.\*$/.test(field.path);

// ─── the plugin ──────────────────────────────────────────────
export const gradient: LoomEditorPlugin = {
  name: 'gradient',
  documents: { gradient: gradientSchema },
  widgets: [{ role: SWATCH, match: isColor }],
  mount: (editor) => mountView(editor, previewAction, (e) => ({ gradient: e.documents['gradient'] })),
  components: { [PREVIEW]: Preview, [SWATCH]: Swatch },
};
