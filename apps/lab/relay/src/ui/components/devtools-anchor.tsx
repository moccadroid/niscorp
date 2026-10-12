import { type ReactNode } from 'react';
import { z } from 'zod';
import type { NovaComponent } from '@niscorp/nova/adapters/react';

const DevtoolsAnchorProps = z.object({}).strict();

export const DevtoolsAnchor: NovaComponent<z.infer<typeof DevtoolsAnchorProps>> = ({
  children,
}: z.infer<typeof DevtoolsAnchorProps> & { children?: ReactNode }) => (
  <div
    style={{
      position: 'fixed',
      right: 16,
      bottom: 16,
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      maxHeight: '85vh',
    }}
  >
    {children}
  </div>
);
DevtoolsAnchor.meta = {
  description: 'Fixed bottom-right anchor floating the devtools canvas (pill/dock) above the app.',
  propsSchema: DevtoolsAnchorProps,
};
