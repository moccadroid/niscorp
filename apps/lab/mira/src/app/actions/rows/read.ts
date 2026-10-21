import type { EndpointConfig } from '@niscorp/nova';
import { z } from 'zod';
import { readRequest } from './read.prism';

export const readInput = (shape: string): z.ZodRawShape => ({
  title: z.string().describe('The heading on the card.'),
  read: z.string().describe(`Which read it shows, by fingerprint: one that answers ${shape}.`),
  params: z.record(z.string(), z.unknown()).describe('The values the read is asked with.'),
});

export const readEndpoint = (target: string): EndpointConfig => ({ url: '/api/vex', method: 'POST', request: readRequest, target, errorTarget: 'error' });
