import { type FC } from 'react';
import { LoomEditor, defaultPlugins } from '@niscorp/loom/react';
import type { LoomArtifact } from '@niscorp/loom';
import { gradient } from '../plugins/gradient';
import { Panel } from '@showroom/chrome/stage/ui';
import { LoomStage } from '../demo-panel';

// The gradient example plugin in the Loom Editor: edit the gradient (name, angle,
// colours) and the preview re-renders. See "How to build a plugin" for the code.

const artifact: LoomArtifact = {
  type: 'gradient',
  documents: {
    gradient: { name: 'Sunset', angle: 120, colors: ['#ff7e5f', '#feb47b', '#ffca7a'] },
  },
};

export const Demo: FC = () => (
  <LoomStage>
    <Panel title="The gradient plugin" aside="a form, a colour widget and a preview — one file">
      <LoomEditor plugins={[...defaultPlugins(), gradient]} artifact={artifact} />
    </Panel>
  </LoomStage>
);
