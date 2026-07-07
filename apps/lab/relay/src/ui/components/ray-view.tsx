import { z } from 'zod';
import { Nova, useNovaRegistry } from '@niscorp/nova/react';
import type { NovaComponent } from '@niscorp/nova/react';
import type { LayoutNode } from '@niscorp/nova';

// RayView — renders a Ray-generated Nova layout against its data, inside the chat.
// The layout binds to the data ROOT via `$` (an array, object, or scalar — Vex's
// `result` verbatim). Uses the shell's own kit registry so the generated layout's
// components (Table, Box, Text…) resolve. Static for now (dispatches are no-ops);
// interactivity arrives with step 2 (an action).
const RayViewProps = z
  .object({
    layout: z.unknown().describe('The generated Nova LayoutNode.'),
    data: z.unknown().describe('The data the layout binds against (Vex result — array, object, or scalar).'),
  })
  .strict();

export const RayView: NovaComponent<z.infer<typeof RayViewProps>> = ({
  layout,
  data,
}: z.infer<typeof RayViewProps>) => {
  const registry = useNovaRegistry();
  if (layout === undefined || layout === null) return null;
  return (
    <div style={{ margin: '6px 0', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 10, overflow: 'auto' }}>
      <Nova.Layout
        layout={layout as LayoutNode}
        data={(data ?? {}) as Record<string, unknown>}
        registry={registry}
        builtins={false}
      />
    </div>
  );
};
RayView.meta = {
  description: 'Renders a Ray-generated Nova layout against its data, inside the chat.',
  propsSchema: RayViewProps,
};
