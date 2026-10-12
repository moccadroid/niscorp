import type { FC } from 'react';
import { Panel } from '@showroom/chrome/stage/ui';
import { Code } from '@showroom/chrome/stage/ui';

export const RawJsonPanel: FC<{ value: unknown }> = ({ value }) => (
  <Panel title="What your UI would render" aside="stream.current(), live">
    <Code maxHeight={400}>{JSON.stringify(value, null, 2)}</Code>
  </Panel>
);
