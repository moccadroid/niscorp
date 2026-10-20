import { z } from 'zod';

// What every action that shows a read is opened with, and how it asks vex for it: the read's fingerprint, and the
// values it is asked with. The engine answers it under the person's policy, and again when what it read changes.
export const readInput = {
  title: z.string().describe('What it shows, in a few words.'),
  read: z.string().describe('The fingerprint of the read it shows.'),
  params: z.record(z.string(), z.unknown()).describe('The values the read is asked with.'),
};

export const readEndpoint = (target: string) => ({
  url: '/api/vex',
  method: 'POST' as const,
  request: { fingerprint: { $ref: '$.read' }, context: { $ref: '$.params' } },
  target,
  errorTarget: 'error',
});
