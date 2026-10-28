import { defineAgent } from '@niscorp/cortex';
import type { AgentDefinition, OutputValidator } from '@niscorp/cortex';
import type { z } from 'zod';
import { aboutMira, actionCatalog, INSTRUCTIONS, screenCatalog, theScreen, yourPerson } from './knowledge';
import type { ComposerDeps } from './knowledge';
import type { Reply } from './reply.schema';

// Defined for each message: the reply's schema names the cards on the screen it was asked on.
export const composerAgent = (schema: z.ZodType<Reply>, validate: OutputValidator<Reply>): AgentDefinition<Reply, ComposerDeps> =>
  defineAgent<Reply, ComposerDeps>({
    id: 'mira.compose',
    description: 'Answers a message with a screen composed from the app’s actions.',
    instructions: INSTRUCTIONS,
    context: [actionCatalog, screenCatalog, aboutMira, yourPerson, theScreen],
    // An agent with no tools on Groq would be sent the envelope as Groq's loose JSON schema, and gpt-oss answers this one
    // worse there: emit carries the contract in the prompt, as every Groq agent with tools gets it.
    output: { schema, response: 'required', strategy: 'emit', validate },
  });
