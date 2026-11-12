import type { ShellManifest } from '@niscorp/moss';
import type { LayoutNode } from '@niscorp/nova';
import { frameLayout } from './frame.layout';

const each: LayoutNode = { for: '$.instances', as: 'one', key: 'id', do: { component: 'ActionSlot', props: { instanceId: '$one.id' } } };

export const shell: ShellManifest = {
  canvases: [
    // The screen shown: its cards, one under another — the first screen's when a shell is built (`seeds`), then the one
    // opened (`screens.open`, src/server/compose/index.ts).
    { id: 'screen', mode: 'list', actionLayout: { component: 'Grid', props: { columns: 1 }, children: [each] } },
    // The conversation, drawn in the dock: each turn, then its cards (`ask`). Empty until something is asked.
    { id: 'talk', mode: 'list', actionLayout: [each] },
    { id: 'dock', initial: 'ask.dock' },
  ],
  layout: frameLayout,
};
