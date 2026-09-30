import type { Sequence } from '@niscorp/strata';

// A document step sees one layout node (`$.document`) and returns it, changed
// or not.
const node = { $ref: '$.document' };
const lookIs = (value: string): unknown => ({ $eq: [{ $get: { from: node, path: ['props', 'look'], fallback: null } }, { $const: value }] });

// LYCEUM'S OWN GRAMMAR — the kit's component props (src/ui/kit.props.ts), which
// every layout here is written in, beside nova's and Prism's. Version 0 is the
// kit as it stood when it got a sequence. HISTORY: append, never edit — a kit
// prop renamed or removed is a migration here whose document steps rewrite the
// layout nodes that use it (a Prism config over one node, at nisc.nova/layout);
// an addition is an empty marker. `kit-check` refuses a kit change without one.
export const LYCEUM_KIT: Sequence = {
  id: 'lyceum.kit',
  documents: { props: { embeds: {} } },
  migrations: [
    {
      // A MARKER: additions only, so no layout needs rewriting — but a reader
      // at 0 must refuse a layout that uses them.
      description: 'Sheet: a narrow arrangement for phone-width screens; Action: size large',
      steps: [],
    },
    {
      // A MARKER: a component added.
      description: 'Countdown: the time left until an instant, ticking where it is shown',
      steps: [],
    },
    {
      // A MARKER: a component added.
      description: 'Look: which kit paints the screen, poster or plain',
      steps: [],
    },
    {
      // A MARKER: a prop added.
      description: "Field: enter 'clears' — a field whose Enter sends it empties",
      steps: [],
    },
    {
      // A MARKER: a value added to a closed set.
      description: "Cell: scroll 'end' — a scrolling cell held at its end",
      steps: [],
    },
    {
      // A MARKER: two components added.
      description: 'Flow: two ends and what passes between them; Columns: numbers as bars',
      steps: [],
    },
    {
      // Look names a renderer now, not a kit: dom, react or vue — the plain
      // kit is gone. The poster was nova's DOM adapter wearing the stylesheet,
      // so both old words become dom.
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
  ],
};
