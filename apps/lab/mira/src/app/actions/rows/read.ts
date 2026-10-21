import { z } from 'zod';

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
