import type { ReactNode } from 'react';
import { Grid, INK, Panel } from '@showroom/chrome/stage/ui';

export const LoomStage = ({ children }: { children: ReactNode }) => (
  <div style={{ maxWidth: 1180, margin: '0 auto', padding: '20px 24px 48px', display: 'flex', flexDirection: 'column', gap: 16, color: INK.text }}>{children}</div>
);

export const DemoPanel = ({ form, output, formAside, outputAside }: { form: ReactNode; output: ReactNode; formAside?: ReactNode; outputAside?: ReactNode }) => (
  <LoomStage>
    <Grid min={340} gap={16}>
      <Panel title="The form" aside={formAside ?? 'compiled from the Zod schema by loom'}>
        {form}
      </Panel>
      <Panel title="The document it writes" aside={outputAside ?? 'live, as you type'}>
        {output}
      </Panel>
    </Grid>
  </LoomStage>
);
