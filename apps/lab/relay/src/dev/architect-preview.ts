// Preview: the EXACT prefix the architect (or validator) would send —
// every system chunk with its size, the resolved output strategy, and
// the real tool descriptors. No model call, no key needed. Run:
//
//   pnpm --filter relay exec tsx src/dev/architect-preview.ts
//   ... [--agent=validator] [--edit] [--full] [--intent="..."]
//
// With GROQ_API_KEY set, capabilities come from the real client; without
// one, from signal's registry entry for groq — either way the preview
// resolves the strategy the browser run would (emit on Groq).
import type { SignalClient } from '@niscorp/cortex';
import { providerRegistry } from '@niscorp/signal';
import { createGroqClient, GROQ_MODEL } from '@relay/llm/groq';
import { architectAgent } from '@relay/ray/architect/architect.agent';
import { validatorAgent } from '@relay/ray/architect/validator.agent';
import { editingGuide } from '@relay/ray/architect/producers';
import { makeArchitectTools } from '@relay/ray/architect/tools';

const DEFAULT_INTENT =
  'A searchable table of all companies showing name, industry and size. Typing in the search box filters the list; clicking a row opens that company.';

// preview() never calls the model — a describe-only client is enough to
// resolve the strategy exactly as the browser's Groq client would.
const describeOnlyGroq = (): SignalClient => ({
  describe: () => ({ provider: 'groq', model: GROQ_MODEL, capabilities: providerRegistry['groq']!.capabilities }),
  step: () => Promise.reject(new Error('preview-only client')),
  stepStream: () => {
    throw new Error('preview-only client');
  },
  count: (input) => Promise.resolve(typeof input === 'string' ? Math.ceil(input.length / 4) : input.length * 8),
});

const label = (content: string): string => {
  const first = content.split('\n', 1)[0] ?? '';
  return first.length > 72 ? `${first.slice(0, 69)}…` : first;
};

const main = async (): Promise<void> => {
  const which = process.argv.find((arg) => arg.startsWith('--agent='))?.slice(8) ?? 'architect';
  const full = process.argv.includes('--full');
  const edit = process.argv.includes('--edit');
  const intent = process.argv.find((arg) => arg.startsWith('--intent='))?.slice(9) ?? DEFAULT_INTENT;

  const key = process.env['GROQ_API_KEY'];
  const llm = key !== undefined && key !== '' ? createGroqClient(key) : describeOnlyGroq();
  const tools = makeArchitectTools(llm);

  const preview =
    which === 'validator'
      ? await validatorAgent.preview(
          { intent, action: { id: 'view.sample', data: {}, layout: { component: 'Stack' } }, report: { issues: [], loaded: {} } },
          { llm },
        )
      : await architectAgent.preview(
          { intent: edit ? `You are EDITING the existing action "view.sample" (see EDITING).\n\nCURRENT DEFINITION:\n{}\n\nCHANGE REQUEST: ${intent}` : intent },
          {
            llm,
            tools: [tools.discover, tools.query, tools.runAction],
            ...(edit && { producers: [editingGuide] }),
          },
        );

  console.log(`agent      ${which === 'validator' ? validatorAgent.agentId : architectAgent.agentId}`);
  console.log(`strategy   ${preview.strategy}${preview.respondDetail !== undefined ? ` (${preview.respondDetail})` : ''}`);
  console.log(`tokens     ~${preview.estimatedTokens}`);
  console.log(`\n── prefix (${preview.messages.length} messages) ──`);
  for (const [index, message] of preview.messages.entries()) {
    const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
    const line = `${String(index).padStart(2)}  ${message.role.padEnd(9)} ${String(content.length).padStart(6)} ch  ${label(content)}`;
    console.log(line);
    if (full) console.log(`${'─'.repeat(80)}\n${content}\n${'─'.repeat(80)}`);
  }
  console.log(`\n── tools (${preview.tools.length}) ──`);
  for (const tool of preview.tools) {
    console.log(`  ${tool.name.padEnd(12)} params ${JSON.stringify(tool.parameters).length} ch  ${tool.description.slice(0, 60)}`);
  }
};

main().catch((err: unknown) => {
  console.error('PREVIEW FAILED:', err);
  process.exit(1);
});
