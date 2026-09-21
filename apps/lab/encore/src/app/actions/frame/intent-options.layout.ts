import type { LayoutNode } from '@niscorp/nova';

// "Suggestions" to an operator; "maybe", with how sure Jev was, under x-ray.
const chipRow = (xray: boolean): LayoutNode => ({
  component: 'Row',
  props: { gap: 8, align: 'center', wrap: true },
  children: [
    { component: 'Text', props: { value: xray ? 'maybe' : 'Suggestions', variant: 'label', tone: 'mute' } },
    { for: '$.chips', as: 'chip', key: 'id', do: { component: 'Chip', ref: 'chip', props: { label: '$.chip.label', value: '$.chip.id', ...(xray ? { meter: '$.chip.p' } : {}) } } },
  ],
});

const chips: LayoutNode = { if: '$.chips.length', then: { if: '$.xray', then: chipRow(true), else: chipRow(false) }, else: '' };

// Two states, and the strip renders NOTHING in the third: with no sentence and
// no chips the tray is an empty tree, and the frame collapses it.
// ...and a fourth: THE IDLE ROOM. Nothing mounted, nothing raised, nothing on the
// line — which used to be a large blank, and read as "broken" to anybody who had
// not watched it empty. One sentence, in the operator's terms.
export const intentOptionsLayout: LayoutNode = {
  if: '$.say',
  then: { component: 'Stack', props: { gap: 8 }, children: [{ component: 'Text', props: { value: '$.say', tone: 'mute' } }, chips] },
  // (The loop's sentence offers the director to whoever holds its deck — and the
  // deck is x-ray's, so the app says the plain half.)
  else: { if: '$.idle', then: { component: 'Text', props: { value: { $if: '$.xray', $then: '$.idle', $else: 'Nothing needs attention right now. Say what is happening.' }, tone: 'mute' } }, else: chips },
};
