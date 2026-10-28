import type { Sequence } from '@niscorp/strata';

const plan = { $ref: '$.document' };
const area = { $var: 'area' };
const areaName = { $get: { from: area, path: ['props', 'name'], fallback: { $const: null } } };
const canvasIn = (field: string) => ({ $get: { from: plan, path: ['canvases', areaName, 0, field] } });

// The plan of an answer, as the answers table keeps it with the grammars it was written at.
export const ANSWERS_GRAMMAR: Sequence = {
  id: 'mira.answers',
  documents: { plan: { embeds: { layout: 'nisc.nova/layout' } } },
  migrations: [
    {
      description:
        'A plan is its cards in reading order, each with its action, input, span, ink and mark, and the columns they are laid out in; it was a canvas for each of the areas a–f, laid out by a nova layout',
      steps: [
        {
          kind: 'document',
          at: 'mira.answers/plan',
          transform: {
            $with: {
              let: { ink: { $get: { from: plan, path: ['ink'], fallback: { $const: 'turn-1' } } } },
              value: {
                columns: { $get: { from: plan, path: ['layout', 'props', 'columns'], fallback: { $const: 1 } } },
                ink: { $var: 'ink' },
                cards: {
                  $map: {
                    over: {
                      $filter: {
                        over: { $get: { from: plan, path: ['layout', 'children'], fallback: { $const: [] } } },
                        as: 'area',
                        when: { $neq: [{ $get: { from: plan, path: ['canvases', areaName, 0], fallback: { $const: null } } }, { $const: null }] },
                      },
                    },
                    as: 'area',
                    body: {
                      action: canvasIn('action'),
                      input: canvasIn('input'),
                      span: { $get: { from: area, path: ['props', 'span'], fallback: { $const: 1 } } },
                      ink: { $get: { from: plan, path: ['inks', areaName], fallback: { $var: 'ink' } } },
                      mark: { $get: { from: plan, path: ['marks', areaName], fallback: { $const: null } } },
                      __optional: ['mark'],
                    },
                  },
                },
              },
            },
          },
        },
      ],
    },
  ],
};
