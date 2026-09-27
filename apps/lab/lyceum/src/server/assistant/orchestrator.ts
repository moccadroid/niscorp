import { defineAgent } from '@niscorp/cortex';
import type { ToolDefinition } from '@niscorp/cortex';
import { createSignal } from '@niscorp/signal';

// THE ONE ASSISTANT'S TURN. The same agent for everybody, on every device;
// what differs per person is handed to each run — the knowledge assembled from
// their declarations (instructions, grounding read as them, the actions they
// can be offered) and the tools those declarations name. It decides what the
// person wants and hands it to the right tool: a query to `query`, something
// to happen later to `automate` (tide's agent does the writing), something to
// do on their phone to `open`. It never acts; it answers and proposes.
//
//   LYCEUM_ASSISTANT=live   gpt-oss-120b at `low`; needs GROQ_API_KEY
//   LYCEUM_ASSISTANT=fake   a deterministic stand-in that routes by a few
//                           words and calls the SAME tools — what the checks
//                           use. It measures nothing about a model.
//
// Unset, it is `live` with a Groq key and `fake` without.

export type Turn = { message: string; knowledge: string; tools: readonly ToolDefinition[] };
export type Orchestrator = { kind: 'live' | 'fake'; answer: (turn: Turn) => Promise<string> };

const INSTRUCTIONS = `You are the assistant in this room. You speak for nobody and you do nothing yourself: everything you offer is through your tools, and a tool only PROPOSES — a button the person presses, an answer to read, an automation to read and save.

Work out what the person wants and use the one tool that fits; the ASSISTANT FOR THIS PERSON section says who they are, what they may do, and what you know. If none of your tools fits, or they ask for something they may not do, say so plainly in one sentence — never pretend. Keep replies to one or two sentences: the proposal carries the rest.`;

const assistantAgent = defineAgent({
  id: 'lyceum.assistant',
  description: 'The assistant on every device: routes a request to the tool that fits, and proposes rather than acts.',
  instructions: INSTRUCTIONS,
});

const liveOrchestrator = (): Orchestrator => {
  const llm = createSignal('groq', { options: { reasoningEffort: 'low' } }).model('openai/gpt-oss-120b');
  return {
    kind: 'live',
    answer: async (turn) => {
      const result = await assistantAgent.run(turn.message, { llm, tools: turn.tools, producers: [() => turn.knowledge] }).result;
      if (!result.ok) throw new Error(`The assistant could not answer: ${result.error.message}`);
      return result.output.response ?? '';
    },
  };
};

// The stand-in's routing: a time → automate, "change my name to …" → open the
// rename, anything else → query. Each through the tool the person was given, or
// the same one-line refusal the live assistant owes them.
const fakeOrchestrator = (): Orchestrator => ({
  kind: 'fake',
  answer: async (turn) => {
    const tool = (name: string): ToolDefinition | undefined => turn.tools.find((candidate) => candidate.toolId === name);
    const call = async (name: string, input: unknown): Promise<unknown> =>
      tool(name)?.config.execute(input, { runId: 'fake', agentId: 'lyceum.assistant', agentPath: [], signal: new AbortController().signal, forward: () => undefined });
    const message = turn.message.trim();
    // "What is on my screen?" — read back what it was handed about the screen.
    if (/\bscreen\b/i.test(message)) {
      const section = turn.knowledge.split('\n\n').find((part) => part.startsWith('ON THEIR SCREEN')) ?? '';
      return `On your screen: ${section.slice(section.indexOf('\n') + 1).slice(0, 1200)}`;
    }
    if (/\b(in \d+|minutes?|hours?|at \d)/i.test(message)) {
      if (tool('automate') === undefined) return 'I cannot set up automations for you.';
      await call('automate', { request: message });
      return 'Here it is — read it, then save it.';
    }
    const rename = /change my name to (.+)$/i.exec(message)?.[1];
    if (rename !== undefined) {
      if (tool('open') === undefined) return 'I cannot open anything for you.';
      await call('open', { action: 'forms.rename', label: `Change your name to ${rename}`, input: { draft: rename } });
      return 'Press the button to file the change.';
    }
    if (tool('query') === undefined) return 'I cannot query the records for you.';
    await call('query', { request: message });
    return 'Here is what the records say.';
  },
});

export const createOrchestrator = (env: Record<string, string | undefined>): Orchestrator => {
  const asked = env['LYCEUM_ASSISTANT'];
  const hasKey = (env['GROQ_API_KEY'] ?? '') !== '';
  if (asked === 'fake' || (asked !== 'live' && !hasKey)) return fakeOrchestrator();
  if (!hasKey) throw new Error('lyceum: LYCEUM_ASSISTANT=live needs GROQ_API_KEY in apps/lab/lyceum/.env.');
  return liveOrchestrator();
};
