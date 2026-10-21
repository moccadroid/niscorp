import type { EndpointConfig } from '@niscorp/nova';
import { z } from 'zod';
import { readRequest } from './read.prism';

// `answers` is what the read must answer for the action to show it.
export const readInput = (answers: string): z.ZodRawShape => ({
  title: z.string().describe('The heading on the card.'),
  read: z.string().describe(`Which read it shows, by fingerprint: one that answers ${answers}.`),
  params: z.record(z.string(), z.unknown()).describe('The values the read is asked with.'),
});

export const readEndpoint = (target: string): EndpointConfig => ({ url: '/api/vex', method: 'POST', request: readRequest, target, errorTarget: 'error' });
