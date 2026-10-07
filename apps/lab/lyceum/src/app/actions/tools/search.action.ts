import type { ActionDefinition, Step } from '@niscorp/nova';

// THE SEARCH — a stored query that takes a value (members/search, `q`), run
// from the controller with what the speaker typed, or on purpose without it.
// What comes back is what the stage shows on the values slide, mirrored from
// this tool's data (server/mirroring.ts): the request as sent, the statement
// with the value bound as $1, the rows — or, sent without `q`, an empty answer
// and the key it missed. The engine's own answer, read with its meta
// (server/functions/query.functions.ts).
const search = (bare: boolean): Step[] => [
  { set: 'error', value: '' },
  { set: 'bare', value: bare },
  { call: 'search' },
];

export const searchTool: ActionDefinition = {
  id: 'tools.search',
  title: 'Search the room',
  data: { q: '', bare: false, searched: { sent: '', sql: '', rows: [], missing: '', contract: '' }, error: '' },
  layout: {
    component: 'Sheet',
    props: { areas: ['kick kick', 'field go', 'bare bare', 'out out'], cols: [3, 1] },
    children: [
      { component: 'Cell', props: { area: 'kick', ink: 'ink' }, children: [{ component: 'Label', children: 'Search the room — a value in the request' }] },
      { component: 'Field', ref: 'q', model: '$.q', props: { area: 'field', value: '$.q', placeholder: 'Part of a name' } },
      { component: 'Action', ref: 'search', props: { area: 'go', ink: 'signal', label: 'Search →' } },
      { component: 'Action', ref: 'bare', props: { area: 'bare', ink: 'paper', label: 'Send it without q' } },
      {
        if: '$.error',
        then: { component: 'Cell', props: { area: 'out' }, children: [{ component: 'Text', children: '{{$.error.message}}' }] },
        else: {
          if: '$.searched.sent',
          then: {
            component: 'Cell',
            props: { area: 'out' },
            children: [
              { component: 'Label', children: 'Sent' },
              { component: 'Code', props: { text: '$.searched.sent' } },
              {
                if: '$.searched.missing',
                then: { component: 'Text', children: 'Empty. Missing: {{$.searched.missing}}' },
                else: { component: 'Rows', props: { rows: '$.searched.rows', rowKey: 'name', empty: 'Nobody matches.', columns: [{ label: 'Name', key: 'name', w: 1 }] } },
              },
            ],
          },
          else: { component: 'Cell', props: { area: 'out' }, children: [{ component: 'Text', props: { tone: 'muted' }, children: 'The room watches the request, the statement and the rows on the stage.' }] },
        },
      },
    ],
  },
  endpoints: { search: { fn: 'room.search', target: 'searched', errorTarget: 'error' } },
  triggers: [
    { event: 'ui:click', ref: 'search', do: search(false) },
    { event: 'ui:key', ref: 'q', key: 'Enter', do: search(false) },
    { event: 'ui:click', ref: 'bare', do: search(true) },
  ],
};
