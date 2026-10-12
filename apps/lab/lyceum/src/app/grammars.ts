import type { Sequence } from '@niscorp/strata';

const node = { $ref: '$.document' };
const lookIs = (value: string): unknown => ({ $eq: [{ $get: { from: node, path: ['props', 'look'], fallback: null } }, { $const: value }] });

// Append, never edit. A kit prop renamed or removed is a migration whose
// document steps rewrite the layout nodes that use it; an addition is one with
// no steps.
export const LYCEUM_KIT: Sequence = {
  id: 'lyceum.kit',
  documents: { props: { embeds: {} } },
  migrations: [
    {
      // Additions only, so no layout needs rewriting, but a reader at 0 must
      // refuse a layout that uses them.
      description: 'Sheet: a narrow arrangement for phone-width screens; Action: size large',
      steps: [],
    },
    {
      description: 'Countdown: the time left until an instant, ticking where it is shown',
      steps: [],
    },
    {
      description: 'Look: which kit paints the screen, poster or plain',
      steps: [],
    },
    {
      description: "Field: enter 'clears' — a field whose Enter sends it empties",
      steps: [],
    },
    {
      description: "Cell: scroll 'end' — a scrolling cell held at its end",
      steps: [],
    },
    {
      description: 'Flow: two ends and what passes between them; Columns: numbers as bars',
      steps: [],
    },
    {
      description: 'Look: which renderer draws the screen — dom, react or vue (poster and plain become dom)',
      steps: [
        {
          kind: 'document',
          at: 'nisc.nova/layout',
          transform: {
            $case: {
              branches: [
                {
                  when: { $and: [{ $eq: [{ $get: { from: node, path: ['component'], fallback: null } }, { $const: 'Look' }] }, { $or: [lookIs('poster'), lookIs('plain')] }] },
                  then: { $update: { from: node, path: ['props', 'look'], value: { $const: 'dom' } } },
                },
              ],
              else: node,
            },
          },
        },
      ],
    },
    {
      description: 'Xray: whether this screen shows the actions it is made of',
      steps: [],
    },
    {
      description: 'Sigil: check and x — yes and no, as shapes',
      steps: [],
    },
    {
      description: 'Cell: align middle — vertically centred, read from the left',
      steps: [],
    },
    {
      description: 'Action: sound — a chime it plays where it is pressed',
      steps: [],
    },
    {
      description: 'Menu: an icon that opens a list of things to press',
      steps: [],
    },
  ],
};
