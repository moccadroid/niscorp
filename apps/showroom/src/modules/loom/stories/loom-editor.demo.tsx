import { type FC } from 'react';
import { LoomEditor, defaultPlugins } from '@niscorp/loom/react';
import { nova } from '@niscorp/loom/plugins/nova/react';
import type { LoomArtifact } from '@niscorp/loom';
import { library } from '../content/library';

// The Nova plugin in the Loom Editor: a Nova artifact has two documents (layout +
// data). Edit the component tree or the data and the preview re-renders against the
// data. The data has no schema, so the plugin builds its form from the data's keys.

const artifact: LoomArtifact = {
  type: 'nova',
  documents: {
    layout: {
      component: 'Box',
      props: { padding: 28, background: '#1a1a2e', radius: 18 },
      children: [
        { component: 'Text', props: { content: '$.title', size: 'xl', weight: 'bold', color: '#00d9ff' } },
        { component: 'Text', props: { content: '$.subtitle', size: 'sm', weight: 'normal', color: '#8a8aa8' } },
        {
          component: 'Stack',
          props: { direction: 'row', gap: 12, align: 'center' },
          children: [
            { component: 'Button', props: { label: 'Launch', variant: 'primary' } },
            { component: 'Button', props: { label: 'Docs', variant: 'ghost' } },
          ],
        },
      ],
    },
    data: { title: 'Nisc Console', subtitle: 'Loom edits the layout. Nova renders it against the data.' },
  },
};

export const Demo: FC = () => (
  <div style={{ padding: 24 }}>
    <LoomEditor plugins={[...defaultPlugins(), nova({ manifest: library })]} artifact={artifact} />
  </div>
);
