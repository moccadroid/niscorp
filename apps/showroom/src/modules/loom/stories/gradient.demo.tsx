import { type FC } from 'react';
import { LoomEditor, defaultPlugins } from '@niscorp/loom/react';
import type { LoomArtifact } from '@niscorp/loom';
import { gradient } from '../plugins/gradient';

// The gradient example plugin in the Loom Editor: edit the gradient (name, angle,
// colours) and the preview re-renders. See "How to build a plugin" for the code.

const artifact: LoomArtifact = {
  type: 'gradient',
  documents: {
    gradient: { name: 'Sunset', angle: 120, colors: ['#ff7e5f', '#feb47b', '#ffca7a'] },
  },
};

export const Demo: FC = () => (
  <div style={{ padding: 24 }}>
    <LoomEditor plugins={[...defaultPlugins(), gradient]} artifact={artifact} />
  </div>
);
