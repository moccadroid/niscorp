import type { CSSProperties, FC } from 'react';
import type { LayoutNode } from '@niscorp/nova';
import { Nova, type NovaComponent } from '@niscorp/nova/adapters/react';
import { isRecord } from '@compile/parse';

// The preview component: receives the live documents and renders `layout` against
// `data` with Nova, using the manifest's render functions. Registered under
// PREVIEW by the surface; the plugin's mount binds the documents to it.

const frame: CSSProperties = {
  padding: 24,
  borderRadius: 12,
  minHeight: 220,
  background: 'radial-gradient(circle at 30% 15%, #1b1b3a, #0c0c18 70%)',
  border: '1px solid #2a2a4a',
};

export const makePreview = (components: Record<string, NovaComponent>): NovaComponent<{ documents?: unknown }> => {
  const Preview: FC<{ documents?: unknown }> = ({ documents }) => {
    const docs = isRecord(documents) ? documents : {};
    const layout = docs['layout'];
    const data = isRecord(docs['data']) ? (docs['data'] as Record<string, unknown>) : {};
    return (
      <div style={frame}>
        {isRecord(layout) ? (
          <Nova.Layout layout={layout as LayoutNode} data={data} components={components} builtins={false} />
        ) : null}
      </div>
    );
  };
  return Preview;
};
