import type { ReactNode } from 'react';
import { z } from 'zod';
import type { NovaComponent } from '@niscorp/nova/adapters/react';

const AsideProps = z.object({}).strict();

export const Aside: NovaComponent<z.infer<typeof AsideProps>> = ({ children }: z.infer<typeof AsideProps> & { children?: ReactNode }) => (
  <aside className="at-aside">{children}</aside>
);
Aside.meta = { description: 'A contextual side panel: right-hand on wide screens, stacked below on narrow. Frames only.', propsSchema: AsideProps };

const RailProps = z.object({}).strict();

export const Rail: NovaComponent<z.infer<typeof RailProps>> = ({ children }: z.infer<typeof RailProps> & { children?: ReactNode }) => (
  <aside className="at-rail">{children}</aside>
);
Rail.meta = { description: 'A narrow side column for glanceable, occasional surfaces. Frames only.', propsSchema: RailProps };
