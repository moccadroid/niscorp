import { z } from 'zod';

export const MessageEnvelopeSchema = z
  .object({
    channel: z.string().describe('Channel name the message is published on.'),
    from: z.string().optional().describe('Optional sender identifier.'),
    to: z.string().optional().describe('Optional direct recipient identifier.'),
    payload: z.unknown().optional().describe('Optional message payload.'),
  })
  .strict()
  .describe('A message envelope passed through the message bus.');

export type MessageEnvelope = z.infer<typeof MessageEnvelopeSchema>;
