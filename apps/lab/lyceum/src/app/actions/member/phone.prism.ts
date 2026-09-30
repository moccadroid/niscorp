// THE PHONE'S LIST, AS TRANSFORMS (member/phone.action.ts). The middle of the
// phone is a list canvas: `stack` is the actions on it, in order, and the
// phone reconciles the canvas to it. A button on the bar slots its action into
// the list, or takes it out again: these compute that, and which buttons are
// on, from the phone's own data.

const isPressed = { $eq: [{ $get: { from: { $var: 'row' }, path: ['action'] } }, { $ref: '$.pressed' }] };
const pressedIsOnTheList = { $gt: [{ $length: { $filter: { over: { $ref: '$.stack' }, as: 'row', when: isPressed } } }, 0] };

// The list with the pressed action taken out if it was on it, added at the end
// if it was not.
export const toggledStack = {
  $case: {
    branches: [
      {
        when: pressedIsOnTheList,
        then: { $filter: { over: { $ref: '$.stack' }, as: 'row', when: { $neq: [{ $get: { from: { $var: 'row' }, path: ['action'] } }, { $ref: '$.pressed' }] } } },
      },
    ],
    else: { $flatten: [{ $ref: '$.stack' }, [{ action: { $ref: '$.pressed' } }]] },
  },
};

// The bar's buttons, each marked `on` when its action is on the list.
export const markedTabs = {
  $map: {
    over: { $ref: '$.bar.tabs' },
    as: 'tab',
    body: {
      $merge: [
        { $var: 'tab' },
        {
          on: {
            $gt: [
              {
                $length: {
                  $filter: {
                    over: { $ref: '$.stack' },
                    as: 'row',
                    when: { $eq: [{ $get: { from: { $var: 'row' }, path: ['action'] } }, { $get: { from: { $var: 'tab' }, path: ['action'] } }] },
                  },
                },
              },
              0,
            ],
          },
        },
      ],
    },
  },
};
