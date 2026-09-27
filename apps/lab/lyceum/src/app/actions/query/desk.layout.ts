import type { LayoutNode } from '@niscorp/nova';
import { resultCell } from './result.layouts';

// A line to type, Run, and the result. Green: a query answers from the live
// records.
export const queryDeskLayout: LayoutNode = {
  component: 'Sheet',
  props: { areas: ['kick', 'field', 'go', 'result'], rows: ['auto', 'auto', 'auto', 'auto'] },
  children: [
    { component: 'Cell', props: { area: 'kick', ink: 'live' }, children: [{ component: 'Label', children: 'Vex query · the records, from plain words' }] },
    { component: 'Field', ref: 'draft', model: '$.draft', props: { area: 'field', value: '$.draft', placeholder: 'Who arrived first?' } },
    { component: 'Action', ref: 'run', props: { area: 'go', ink: 'live', label: 'Run query →' } },
    resultCell('result'),
  ],
};
