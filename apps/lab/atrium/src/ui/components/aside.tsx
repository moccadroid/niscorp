import type { ReactNode } from 'react';
import { z } from 'zod';
import type { NovaComponent } from '@niscorp/nova/adapters/react';

// The aside — a contextual panel BESIDE the work, never over it. On a wide
// screen it is a right-hand sidebar; on a narrow one it stacks under the main
// content (mobile first: nothing is ever hidden off-canvas). Domain-blind: it
// frames, the placed action decides everything inside.
const AsideProps = z.object({}).strict();

export const Aside: NovaComponent<z.infer<typeof AsideProps>> = ({ children }: z.infer<typeof AsideProps> & { children?: ReactNode }) => (
  <aside className="at-aside">{children}</aside>
);
Aside.meta = { description: 'A contextual side panel: right-hand on wide screens, stacked below on narrow. Frames only.', propsSchema: AsideProps };

// The rail — narrower than the aside and for a different job: things a clerk
// glances at or reaches for twice a shift, kept out of the working column so
// reaching for one never moves the other. Same behaviour on narrow screens:
// it falls under the work instead of hiding.
const RailProps = z.object({}).strict();

export const Rail: NovaComponent<z.infer<typeof RailProps>> = ({ children }: z.infer<typeof RailProps> & { children?: ReactNode }) => (
  <aside className="at-rail">{children}</aside>
);
Rail.meta = { description: 'A narrow side column for glanceable, occasional surfaces. Frames only.', propsSchema: RailProps };
