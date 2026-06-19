import { type ReactNode } from 'react';
import { z } from 'zod';
import { useNovaDispatch, type NovaComponent } from '@niscorp/nova/react';

// The one genuinely-CSS part of a modal: a fixed, dimmed backdrop that centers
// its children. Everything else — the card, header, title, ✕, footer buttons,
// and their behaviour — is the `modal` ActionFragment (data, not code), dropped
// in here as `children`. A backdrop click fires `ui:click ref="close"`, which
// the fragment's close trigger pops; that dismiss is the only behaviour the
// backdrop owns.
const OverlayProps = z.object({}).strict();

export const Overlay: NovaComponent<z.infer<typeof OverlayProps>> = ({
  children,
}: z.infer<typeof OverlayProps> & { children?: ReactNode }) => {
  const dispatch = useNovaDispatch();
  return (
    <div
      className="rl-overlay"
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
