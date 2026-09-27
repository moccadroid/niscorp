import type { LayoutNode } from '@niscorp/nova';
import { answerLayout } from '@lyceum/app/actions/shared/answer.layouts';

// A QUERY'S OUTCOME, in one place — one of four, in this order: what went
// wrong, the wait, the result in the shape the router picked
// (shared/answer.layouts.ts), or, before anything ran, where it will land. The
// desk shows it under its field; `query.result` is it alone, over the screen.
export const resultCell = (area: string): LayoutNode => ({
  if: '$.error',
  then: { component: 'Cell', props: { area }, children: [{ component: 'Text', children: '{{$.error.message}}' }] },
  else: {
    if: '$.running',
    then: { component: 'Cell', props: { area, mark: 'hatch' }, children: [{ component: 'Text', children: 'Running the query…' }] },
    else: {
      if: '$.answered',
      then: { component: 'Cell', props: { area }, children: answerLayout({ kind: '$.routed.kind', how: '$.routed.how', rows: '$.result' }) },
      else: {
        component: 'Cell',
        props: { area, mark: 'hatch' },
        children: [{ component: 'Text', children: 'The result lands here. A request run before is replayed; a new one is written by a model, under your clearance.' }],
      },
    },
  },
});
