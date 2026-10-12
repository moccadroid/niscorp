import { defineAgent } from '@niscorp/cortex';
import type { ToolDefinition } from '@niscorp/cortex';
import { createSignal } from '@niscorp/signal';

export type Turn = { message: string; knowledge: string; tools: readonly ToolDefinition[] };
export type Orchestrator = { kind: 'live' | 'fake'; answer: (turn: Turn) => Promise<string> };

const INSTRUCTIONS = `You are the assistant inside Lyceum, an application running live during a talk about how it is built. The person writing to you is using it right now — on their phone if they are in the audience, on the controller if they are the speaker. The sections after this one are about them: who they are, what their screen shows, the actions they have, and your conversation so far.

When those sections already hold the answer, answer from them. When they don't, use the tool that fits; each tool says what it does. If none of your tools can do what they want, say so.

Reply to them in one or two short, plain sentences. Report only what the sections or a tool result say: never say something happened, or will happen, unless a tool result says so, and if a tool refused or failed, say so and give its reason, not one of your own. Don't tell them what to press or do on their screen — it shows them — and don't explain the app or its screens unless they ask.`;

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

const fakeOrchestrator = (): Orchestrator => ({
  kind: 'fake',
  answer: async (turn) => {
    const tool = (name: string): ToolDefinition | undefined => turn.tools.find((candidate) => candidate.toolId === name);
    const call = async (name: string, input: unknown): Promise<unknown> =>
      tool(name)?.config.execute(input, { runId: 'fake', agentId: 'lyceum.assistant', agentPath: [], signal: new AbortController().signal, forward: () => undefined });
    const message = turn.message.trim();
    if (/\bscreen\b/i.test(message)) {
      // The section runs to the next heading: a screen has blank lines of its own.
      const from = turn.knowledge.indexOf('ON THEIR SCREEN');
      const rest = from === -1 ? '' : turn.knowledge.slice(from);
      const end = rest.search(/\n\n(THEIR ACTIONS|THE CONVERSATION SO FAR)\n/);
      const section = end === -1 ? rest : rest.slice(0, end);
      return `On your screen: ${section.slice(section.indexOf('\n') + 1).slice(0, 1200)}`;
    }
    if (/\b(in \d+|minutes?|hours?|at \d|I meant)/i.test(message)) {
      if (tool('automate') === undefined) return 'I cannot set up automations for you.';
      const result = await call('automate', { request: message });
      const asked = typeof result === 'object' && result !== null && 'asked' in result && typeof result.asked === 'string' ? result.asked : undefined;
      return asked ?? 'Here it is — read it, then save it.';
    }
    const question = /send the speaker a question: (.+)$/i.exec(message)?.[1];
    if (question !== undefined) {
      if (tool('open') === undefined) return 'I cannot open anything for you.';
      try {
        await call('open', { action: 'questions.send', label: `Your question: ${question}`, input: { draft: question } });
      } catch {
        return 'Sending the speaker a question is not one of your actions.';
      }
      return 'Here is your question, filled in.';
    }
    if (tool('query') === undefined) return 'I cannot query the records for you.';
    await call('query', { intent: message });
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
