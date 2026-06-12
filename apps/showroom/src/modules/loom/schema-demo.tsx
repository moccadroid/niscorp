import { useState, type FC } from 'react';
import type { ZodType } from 'zod';
import type { NovaComponent } from '@niscorp/nova/react';
import { LoomEditor } from '@niscorp/loom/react';
import { JsonViewer } from '@showroom/chrome/json-viewer';
import { DemoPanel } from './demo-panel';

// Showroom helper: render a single-schema Loom editor (one document, `value`) and
// the live JSON beside it. The minimal way to show a form now that <LoomEditor> is
// the editing surface — a one-document plugin, no default plugins, so it's just
// the form. `components` overrides widget roles (the alt-kit demo).
export const SchemaDemo: FC<{ schema: ZodType; value?: unknown; components?: Record<string, NovaComponent> }> = ({ schema, value, components }) => {
  const [data, setData] = useState<unknown>(value ?? {});
  return (
    <DemoPanel>
      <LoomEditor
        plugins={[{ name: 'demo', documents: { value: schema }, ...(components ? { components } : {}) }]}
        artifact={{ type: 'demo', ...(value !== undefined ? { documents: { value } } : {}) }}
        onChange={(docs) => setData(docs['value'])}
      />
      <JsonViewer value={data} />
    </DemoPanel>
  );
};
