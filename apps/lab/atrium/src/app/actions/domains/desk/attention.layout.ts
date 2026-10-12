import type { LayoutNode } from '@niscorp/nova';

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
        else: { component: 'Empty', props: { icon: 'check', title: 'Nothing is waiting', hint: 'Every guest has been answered and every fault has somebody on it.' } },
      },
    },
  ],
};
