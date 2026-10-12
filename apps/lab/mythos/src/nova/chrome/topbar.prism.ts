// The shell's `transform` wraps an array reply as `{ reply, today }`.

const acc = (key: string): Record<string, unknown> => ({
  $get: { from: { $var: 'a' }, path: [key] },
});

export const streakFromDoneDays = {
  $with: {
    let: {
      days: {
        $map: {
          over: { $ref: '$.reply' },
          as: 'row',
          body: {
            $dateDiff: {
              from: { $get: { from: { $var: 'row' }, path: ['done_on'] } },
              to: { $ref: '$.today' },
              unit: 'day',
            },
          },
        },
      },
    },
    value: {
      $case: {
        branches: [
          { when: { $empty: { $var: 'days' } }, then: { $const: 0 } },
          {
            when: { $gt: [{ $get: { from: { $var: 'days' }, path: [0], fallback: { $const: 99 } } }, { $const: 1 }] },
            then: { $const: 0 },
          },
        ],
        else: {
          $get: {
            from: {
              $reduce: {
                over: { $var: 'days' },
                as: 'n',
                acc: 'a',
                init: {
                  expect: { $get: { from: { $var: 'days' }, path: [0] } },
                  count: { $const: 0 },
                  alive: { $const: true },
                },
                body: {
                  $case: {
                    branches: [
                      {
                        when: { $and: [acc('alive'), { $eq: [{ $var: 'n' }, acc('expect')] }] },
                        then: {
                          expect: { $add: [acc('expect'), { $const: 1 }] },
                          count: { $add: [acc('count'), { $const: 1 }] },
                          alive: { $const: true },
                        },
                      },
                    ],
                    else: { expect: acc('expect'), count: acc('count'), alive: { $const: false } },
                  },
                },
              },
            },
            path: ['count'],
          },
        },
      },
    },
  },
};
