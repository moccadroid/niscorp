import { z } from 'zod';

// What every action that shows a read is opened with, and how it asks vex for it: the read's fingerprint, and the
// values it is asked with. The engine answers it under the person's policy, and again when what it read changes.
// `answers` is what the read must answer for the action to show it.
export const readInput = (answers: string) => ({
  title: z.string().describe('The heading on the card.'),
  read: z.string().describe(`Which read it shows, by fingerprint: one that answers ${answers}.`),
  params: z.record(z.string(), z.unknown()).describe('The values the read is asked with.'),
});

export const readEndpoint = (target: string) => ({
  url: '/api/vex',
  method: 'POST' as const,
  request: { fingerprint: { $ref: '$.read' }, context: { $ref: '$.params' } },
  target,
  errorTarget: 'error',
});
