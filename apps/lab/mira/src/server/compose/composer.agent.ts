import { defineAgent } from '@niscorp/cortex';
import type { AgentDefinition, OutputValidator } from '@niscorp/cortex';
import { actionCatalog, arrangementCatalog, INSTRUCTIONS, readCatalog, screenCatalog, writeCatalog } from './knowledge';
import type { ComposerDeps } from './knowledge';
import { ReplySchema } from './reply.schema';
import type { Reply } from './reply.schema';

// Defined for each message: what refuses an answer depends on the screen the message was asked on.
export const composerAgent = (validate: OutputValidator<Reply>): AgentDefinition<Reply, ComposerDeps> =>
  defineAgent<Reply, ComposerDeps>({
    id: 'mira.compose',
    description: 'Answers a message with a screen composed from the app’s actions.',
    instructions: INSTRUCTIONS,
    context: [actionCatalog, readCatalog, writeCatalog, screenCatalog, arrangementCatalog],
    // An agent with no tools on Groq would be sent the envelope as Groq's loose JSON schema, and gpt-oss answers this one
    // worse there: emit carries the contract in the prompt, as every Groq agent with tools gets it.
    output: { schema: ReplySchema, response: 'required', strategy: 'emit', validate },
  });
