import type { ActionDefinition } from '@niscorp/nova';
import { z } from 'zod';
import { resultPrism } from './query.prism';
import { queryResultLayout } from './result.layout';

// ONE VEX QUERY, opened over the screen — by the assistant when it queries the
// records (server/assistant/tools.ts), and again from the conversation, where
// every query a turn ran stays pressable. It arrives already routed: the
// intent, the shape, the fingerprint, how it was reached. Mounting replays the
// fingerprint through vex, as the person — so the result is theirs, under
// their policy, and current whenever it is opened.
export const queryResultAction: ActionDefinition = {
  id: 'query.result',
  title: 'Vex query',
  data: {
    intent: '',
    shape: '',
    routed: { fingerprint: '', kind: '', how: '' },
    result: [],
    running: true,
    error: '',
  },
  input: z.toJSONSchema(
    z.object({
      intent: z.string().optional().describe('What the query was asked for, in words.'),
      shape: z.string().optional().describe('The shape it answers in, as JSON.'),
      routed: z
        .object({
          fingerprint: z.string().describe('The query to replay.'),
          kind: z.string().describe('Which authored shape it is (vex/query.shapes.ts).'),
          how: z.enum(['replayed', 'generated']).describe('How the query was reached.'),
        })
        .optional()
        .describe('The routed query this replays.'),
    }),
  ),
  layout: queryResultLayout,
  endpoints: {
    result: { url: '/api/vex', method: 'POST', request: resultPrism, target: 'result', errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'result', onSuccess: [{ set: 'running', value: false }], onError: [{ set: 'running', value: false }] }] },
  triggers: [],
};
