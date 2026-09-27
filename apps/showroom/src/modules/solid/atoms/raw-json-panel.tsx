import type { FC } from 'react';
import { Panel } from '@showroom/chrome/stage/ui';
import { Code } from '@showroom/chrome/stage/ui';

// Fallback view for demos without a dedicated preview component: the value
// `current()` holds right now, which is what a component would render.

export const RawJsonPanel: FC<{ value: unknown }> = ({ value }) => (
  <Panel title="What your UI would render" aside="stream.current(), live">
    <Code maxHeight={400}>{JSON.stringify(value, null, 2)}</Code>
  </Panel>
);
