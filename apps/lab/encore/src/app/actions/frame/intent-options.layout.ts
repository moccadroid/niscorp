import type { LayoutNode } from '@niscorp/nova';

// ONE ROW OF NEXT STEPS, and two kinds of thing in it that cannot be mistaken
// for each other:
//
//   a CHIP   is a card the room could open — a pill, wearing the hue of the kind
//            of card it is. At most three, the best first (resolve.ts).
//   a LINK   is a question worth asking next — plain words with an arrow. At most
//            two, and only ones this thread has not already asked or been offered
//            (admission.ts). They used to be a second row of identical pills
//            inside the answer card, and said the same three things every turn.
//
// A plan's steps ARE the next steps: while an answer shows steps, the room offers
// no other cards (one row of pills, never two). X-ray lists the whole middle
// band, each chip with how sure Jev was.
const chipsOf = (xray: boolean): LayoutNode => ({
  for: xray ? '$.chips' : '$.suggested',
  as: 'chip',
  key: 'id',
  do: { component: 'Chip', ref: 'chip', props: { label: '$.chip.label', value: '$.chip.id', accent: '$.chip.hue', ...(xray ? { meter: '$.chip.p' } : {}) } },
});

const links: LayoutNode = { for: '$.links', as: 'link', key: 'text', do: { component: 'Button', ref: 'link', props: { label: '$.link.text', value: '$.link.text', variant: 'link' } } };

const row: LayoutNode = {
  component: 'Row',
  props: { gap: 8, align: 'center', wrap: true },
  children: [
    { if: '$.say', then: { component: 'Text', props: { value: '$.say', tone: 'mute' } }, else: '' },
    { if: '$.xray', then: { component: 'Text', props: { value: 'maybe', variant: 'label', tone: 'mute' } }, else: '' },
    { if: '$.xray', then: chipsOf(true), else: { if: '$.stepsUp', then: '', else: chipsOf(false) } },
    links,
  ],
};

// THE IDLE ROOM: nothing mounted, nothing raised, nothing on the line — one quiet
// sentence where the flow would be. (The loop's own sentence offers the director
// to whoever holds its deck, and the deck is x-ray's: the app says the plain half.)
export const intentOptionsLayout: LayoutNode = {
  if: '$.idle',
  then: { component: 'Text', props: { value: { $if: '$.xray', $then: '$.idle', $else: 'Nothing needs attention right now. Say what is happening.' }, tone: 'mute' } },
  // Nothing to say, nothing to offer, nothing to ask: an empty tree, and the frame
  // closes up over it.
  else: { if: '$.say', then: row, else: { if: '$.chips.length', then: row, else: { if: '$.links.length', then: row, else: '' } } },
};
