import type { LayoutNode } from '@niscorp/nova';

// Everything waiting on somebody here, in one column, worst first.
//
// It is five reads rather than one because they are five different kinds of
// stall and each one opens a different record — a guest who has been ignored
// for four hours, a fault nobody has been sent to, an ask that has not been
// answered, an arrival whose room is not turned, and a job handed to a
// colleague who has not picked it up.
//
// Nothing here computes anything. Each group is a query that already sorted
// itself, and each row already carries the ids to open what it is about, which
// is what lets a row be tapped by a finger or aimed at by the assistant with no
// difference between the two.
//
// It takes the full width it is given. An earlier cut capped it at 900 and the
// tables floated in the middle of a wide column with a hand's width of nothing
// down each side — a list of things that need doing should read as the column,
// not as a card somebody dropped into one.

const group = (label: string, rows: string, body: LayoutNode): LayoutNode => ({
  if: rows,
  then: { component: 'Stack', props: { gap: 10 }, children: [{ component: 'Rule', props: { label } }, body] },
  else: '',
});

export const attentionLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 24 },
  children: [
    {
      if: '$.loading',
      then: { component: 'Skeleton', props: { h: 44, count: 4 } },
      else: {
        if: { $or: ['$.waiting.length', '$.unattended.length', '$.pending.length', '$.notReady.count', '$.handed.length'] },
        then: {
          component: 'Stack',
          props: { gap: 24 },
          children: [
            // A guest who has said something and heard nothing. The oldest one
            // is the top row of the top group on purpose: it is almost always
            // the right thing to do next.
            group('Nobody has answered', '$.waiting.length', {
              component: 'Rows',
              props: {
                rows: '$.waiting',
                rowKey: 'stay_id',
                rowRef: 'open-thread',
                selected: '$.openRow',
                empty: '',
                columns: [
                  { label: 'Guest', w: 2, cell: { kind: 'primary', key: 'guest_name', subKey: 'room_display' } },
                  { label: 'Waiting since', w: 'auto', cell: { kind: 'primary', key: 'asked_display' } },
                ],
              },
            }),
            group('Nobody has been sent', '$.unattended.length', {
              component: 'Rows',
              props: {
                rows: '$.unattended',
                rowKey: 'issue_id',
                rowRef: 'open-issue',
                selected: '$.openRow',
                empty: '',
                columns: [
                  { label: 'Fault', w: 2, cell: { kind: 'primary', key: 'summary', subKey: 'room_display' } },
                  { label: '', w: 'auto', cell: { kind: 'chip', key: 'severity', toneKey: 'severity_tone' } },
                  { label: 'Raised', w: 'auto', cell: { kind: 'primary', key: 'raised_display' } },
                ],
              },
            }),
            group('Waiting on a yes', '$.pending.length', {
              component: 'Rows',
              props: {
                rows: '$.pending',
                rowKey: 'request_id',
                rowRef: 'open-pending',
                selected: '$.openRow',
                empty: '',
                columns: [
                  { label: 'Guest', w: 2, cell: { kind: 'primary', key: 'guest_name', subKey: 'room_number' } },
                  { label: 'Asked for', w: 2, cell: { kind: 'primary', key: 'label', subKey: 'detail' } },
                  { label: '', w: 'auto', cell: { kind: 'primary', key: 'amount_display' } },
                ],
              },
            }),
            // No rooms-to-turn notice: it pointed at another surface instead
            // of saying anything, in a `warn` tone at the foot of a list whose
            // rows are all things nobody is on. A room being turned has
            // housekeeping on it.
            group('Handed to somebody', '$.handed.length', {
              component: 'Rows',
              props: {
                rows: '$.handed',
                rowKey: 'task_id',
                empty: '',
                columns: [
                  { label: 'What', w: 2, cell: { kind: 'primary', key: 'title', subKey: 'detail' } },
                  { label: 'With', w: 'auto', cell: { kind: 'primary', key: 'assignee_name', subKey: 'created_display' } },
                ],
              },
            }),
          ],
        },
        // The only genuinely good news a front desk ever gets.
        else: { component: 'Empty', props: { icon: 'check', title: 'Nothing is waiting', hint: 'Every guest has been answered and every fault has somebody on it.' } },
      },
    },
  ],
};
