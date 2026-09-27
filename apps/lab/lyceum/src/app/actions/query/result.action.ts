import type { ActionDefinition } from '@niscorp/nova';
import { z } from 'zod';
import { resultPrism } from './query.prism';
import { resultCell } from './result.layouts';

// ONE QUERY'S RESULT, opened over the screen — what the assistant opens when a
// request is a query (server/assistant/tools.ts). It arrives already routed:
// the fingerprint, the shape, how it was reached. Mounting replays the
// fingerprint through vex, as the person — the same replay the desk does, so
// the result is theirs, under their policy, whoever opened it.
export const queryResultAction: ActionDefinition = {
  id: 'query.result',
  title: 'Query result',
  data: {
    routed: { fingerprint: '', kind: '', how: '' },
    result: [],
    running: true,
    answered: false,
    error: '',
  },
  input: z.toJSONSchema(
    z.object({
      routed: z
        .object({
          fingerprint: z.string().describe('The query to replay.'),
          kind: z.string().describe('The shape it answers in (vex/query.shapes.ts).'),
          how: z.enum(['replayed', 'generated']).describe('How the query was reached.'),
        })
        .optional()
        .describe('The routed query this result replays.'),
    }),
  ),
  layout: { component: 'Sheet', props: { areas: ['result'] }, children: [resultCell('result')] },
  endpoints: {
    result: { url: '/api/vex', method: 'POST', request: resultPrism, target: 'result', errorTarget: 'error' },
  },
  lifecycle: {
    mount: [{ call: 'result', onSuccess: [{ set: 'answered', value: true }, { set: 'running', value: false }], onError: [{ set: 'running', value: false }] }],
  },
  triggers: [],
};
