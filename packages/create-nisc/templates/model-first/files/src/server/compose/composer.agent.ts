import { defineAgent, outputRetries, stepCount } from '@niscorp/cortex';
import type { AgentDefinition, OutputValidator } from '@niscorp/cortex';
import { cardCatalog, INSTRUCTIONS } from './knowledge';
import type { ComposerDeps } from './knowledge';
import { TurnSchema } from './turn.schema';
import type { Turn } from './turn.schema';

export const composerAgent = (validate: OutputValidator<Turn>): AgentDefinition<Turn, ComposerDeps> =>
  defineAgent<Turn, ComposerDeps>({
    id: 'nisc-template-app.compose',
    description: 'Answers a message with a turn of the conversation: a sentence, and the app’s own cards that show the answer.',
    instructions: INSTRUCTIONS,
    context: [cardCatalog],
    // An agent with no tools on Groq would be sent the envelope as Groq's loose JSON schema, and gpt-oss answers this one
    // worse there: emit carries the contract in the prompt.
    output: { schema: TurnSchema, response: 'required', strategy: 'emit', validate },
    // gpt-oss now and then answers with its reasoning alone, which counts as a refused answer: five tries, each about a
    // second, inside the chat model's budget.
    stopWhen: [stepCount(8), outputRetries(5)],
  });
