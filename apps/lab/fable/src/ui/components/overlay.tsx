import { type ReactNode } from 'react';
import { z } from 'zod';
import { useNovaDispatch, type NovaComponent } from '@niscorp/nova/adapters/react';

const OverlayProps = z.object({}).strict();

export const Overlay: NovaComponent<z.infer<typeof OverlayProps>> = ({
  children,
}: z.infer<typeof OverlayProps> & { children?: ReactNode }) => {
  const dispatch = useNovaDispatch();
  return (
    <div
      className="fb-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) dispatch({ type: 'ui:click', ref: 'close' });
      }}
    >
      {children}
    </div>
  );
};
Overlay.meta = {
  description:
    'A fixed, dimmed backdrop that centers its children. The modal chrome is the `modal` fragment; a backdrop click fires ui:click ref="close".',
  propsSchema: OverlayProps,
};
