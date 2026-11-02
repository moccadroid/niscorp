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
    {
      // A MARKER: the reading grammar — a scale, a prop and four components
      // added, for the slides that are read rather than glanced at.
      description: 'The reading scale: Sheet scale page, Text size; Exhibit (a document set out to be read), Pair, Stack, Stats',
      steps: [],
    },
    {
      // A MARKER: a component added.
      description: 'Pipeline: a line of steps that always run, and one detour under it that runs only sometimes',
      steps: [],
    },
    {
      // A MARKER: a prop added.
      description: 'Pipeline: a step’s note — set apart in its corner, how long it took',
      steps: [],
    },
    {
      // A MARKER: a value added to a closed set.
      description: 'Sheet: scale dense — the reading scale a size down, for a slide that holds more',
      steps: [],
    },
    {
      // A MARKER: a component added.
      description: 'Check: a box that is ticked or not, bound to a yes or no in the data',
      steps: [],
    },
    {
      // A MARKER: a prop added.
      description: 'Exhibit: fit — a document set small enough that every line shows',
      steps: [],
    },
    {
      // A MARKER: a set widened.
      description: 'Look: svelte, angular and text join dom, react and vue',
      steps: [],
    },
    {
      // A MARKER: a prop added.
      description: 'Cell: xray — every action inside it outlined, with its id',
      steps: [],
    },
    {
      // A MARKER: a component added.
      description: 'Fold: a heading that opens and shuts what is under it, on each screen alone',
      steps: [],
    },
  ],
};
