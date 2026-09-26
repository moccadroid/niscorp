import type { ActionFragment } from '@niscorp/nova';

// THE SHEET — chrome for anything opened over the screen (rule 3: modality is
// arrangement). An action pushed onto the `overlay` canvas `with: ['sheet']`
// gets a title row, a Close that pops it, and its own layout as a body that
// scrolls inside itself. The action never knows it is in a sheet.
export const sheetFragment: ActionFragment = {
  kind: 'fragment',
  id: 'sheet',
  data: { sheetTitle: '' },
  layout: {
    component: 'Sheet',
    props: { size: 'fill', areas: ['title close', 'body body'], cols: [4, 1], rows: ['auto', 1] },
    children: [
      { component: 'Cell', props: { area: 'title', ink: 'highlight' }, children: [{ component: 'Label', children: '{{$.sheetTitle}}' }] },
      { component: 'Action', ref: 'close', props: { area: 'close', ink: 'ink', label: 'Close' } },
      { component: 'Cell', props: { area: 'body', pad: 'none', scroll: 'y' }, children: [{ slot: 'body' }] },
    ],
  },
  triggers: [{ event: 'ui:click', ref: 'close', do: [{ pop: true }] }],
};

export const FRAGMENTS: Record<string, ActionFragment> = { [sheetFragment.id]: sheetFragment };
