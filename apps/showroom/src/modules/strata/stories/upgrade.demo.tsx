import { DocumentsLab, type GrammarEdit } from '@showroom/modules/strata/documents-lab';
import { action, grammars } from './grammar.fixtures';

// An add-on built before the host's kit renamed Button's `label` to `text`
// stored this action. Its stamp says so: it has seen nova 0 and Prism 0, and
// never heard of acme.kit. Read by today's code, the one migration it has not
// seen runs — on every Button, at every depth: in the list, inside a loop's
// card, in a branch — and the document comes back stamped current.
//
// Pick "already current" and nothing runs. Ship a second kit migration and a
// document at kit 1 runs just that one.

const edits: readonly GrammarEdit[] = [
  {
    label: 'Ship: Button tone → variant',
    hint: 'A second kit migration, /2. Documents at kit 1 run only this one.',
    apply: (gs) =>
      gs.map((g) =>
        g.id !== 'acme.kit'
          ? g
          : {
              ...g,
              migrations: [
                ...g.migrations,
                {
                  description: 'Button: tone → variant',
                  steps: [
                    {
                      kind: 'document' as const,
                      at: 'nisc.nova/layout',
                      transform: {
                        $case: {
                          branches: [
                            {
                              when: { $eq: [{ $get: { from: { $ref: '$.document' }, path: ['props', 'tone'], fallback: null } }, 'primary'] },
                              then: {
                                $merge: [
                                  { $omit: { from: { $ref: '$.document' }, keys: ['props'] } },
                                  { props: { $merge: [{ $omit: { from: { $get: { from: { $ref: '$.document' }, path: ['props'] } }, keys: ['tone'] } }, { variant: 'filled' }] } },
                                ],
                              },
                            },
                          ],
                          else: { $ref: '$.document' },
                        },
                      },
                    },
                  ],
                },
              ],
            },
      ),
  },
];

export const Demo = () => (
  <DocumentsLab
    kind="nisc.nova/action"
    document={action}
    grammars={grammars}
    stamps={[
      { label: 'before the rename', stamp: { 'nisc.nova': 0, 'nisc.prism': 0 } },
      { label: 'after it (kit 1)', stamp: { 'nisc.nova': 0, 'nisc.prism': 0, 'acme.kit': 1 } },
      { label: 'before stamps ({})', stamp: {} },
    ]}
    edits={edits}
    note="The migration is a Prism config over ONE node — no recursion, no knowledge of where Buttons sit. nova's grammar declares where layouts nest; strata finds every one and hands each to the migration, deepest first. Open 'The code' to read it."
  />
);
