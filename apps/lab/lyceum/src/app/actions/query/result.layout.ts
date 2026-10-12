import type { LayoutNode } from '@niscorp/nova';
import { answerLayout } from '@lyceum/app/actions/shared/answer.layouts';

export const queryResultLayout: LayoutNode = {
  component: 'Sheet',
  props: { areas: ['intent', 'shape', 'print', 'result'], rows: ['auto', 'auto', 'auto', 'auto'] },
  children: [
    { component: 'Cell', props: { area: 'intent', ink: 'live' }, children: [{ component: 'Label', children: 'Intent' }, { component: 'Text', children: '{{$.intent}}' }] },
    { component: 'Cell', props: { area: 'shape' }, children: [{ component: 'Label', children: 'Shape · {{$.routed.kind}}' }, { component: 'Code', props: { text: '$.shape' } }] },
    { component: 'Cell', props: { area: 'print' }, children: [{ component: 'Label', children: 'Fingerprint' }, { component: 'Code', props: { text: '$.routed.fingerprint' } }] },
    {
      if: '$.error',
      then: { component: 'Cell', props: { area: 'result' }, children: [{ component: 'Text', children: '{{$.error.message}}' }] },
      else: {
        if: '$.running',
        then: { component: 'Cell', props: { area: 'result', mark: 'hatch' }, children: [{ component: 'Text', children: 'Replaying the query…' }] },
        else: { component: 'Cell', props: { area: 'result' }, children: answerLayout({ kind: '$.routed.kind', how: '$.routed.how', rows: '$.result' }) },
      },
    },
  ],
};
