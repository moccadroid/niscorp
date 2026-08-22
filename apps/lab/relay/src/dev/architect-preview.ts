// Preview: the EXACT prefix the architect (or validator) would send —
// every system chunk with its size, the resolved output strategy, and
// the real tool descriptors. No model call, no key needed. Run:
//
//   pnpm --filter relay exec tsx src/dev/architect-preview.ts
//   ... [--agent=validator] [--edit] [--full] [--intent="..."]
//
// Capabilities come from the model the ARCHITECT is assigned to (the LLM
// seam), because the output strategy is resolved from them and they differ
// per model — so the preview shows the strategy the real run would use.
try {
  process.loadEnvFile();
} catch {
  /* no .env present */
}

import type { SignalClient } from '@niscorp/cortex';
import { assignmentOf, llmFor, MODELS } from '@relay/server/llm';
import { makeArchitectAgent } from '@relay/server/functions/ray/architect/architect.agent';
import { devRayContext } from './engine';
import { validatorAgent } from '@relay/server/functions/ray/architect/validator.agent';
import { editingGuide } from '@relay/server/functions/ray/architect/producers';
import { makeArchitectTools } from '@relay/server/functions/ray/architect/tools';

const DEFAULT_INTENT =
  'A searchable table of all companies showing name, industry and size. Typing in the search box filters the list; clicking a row opens that company.';

// preview() never calls the model, so a key is optional: without one we build
// the assigned model's client anyway and read nothing but its capabilities.
const previewLlm = (): SignalClient => {
  const resolved = llmFor('architect');
  if ('llm' in resolved) return resolved.llm;
  const { model, effort } = assignmentOf('architect');
  return MODELS[model].create('preview-never-calls', effort);
};

const label = (content: string): string => {
  const first = content.split('\n', 1)[0] ?? '';
  return first.length > 72 ? `${first.slice(0, 69)}…` : first;
};

const main = async (): Promise<void> => {
  const which = process.argv.find((arg) => arg.startsWith('--agent='))?.slice(8) ?? 'architect';
  const full = process.argv.includes('--full');
  const edit = process.argv.includes('--edit');
  const intent = process.argv.find((arg) => arg.startsWith('--intent='))?.slice(9) ?? DEFAULT_INTENT;

  const llm = previewLlm();
  const ray = devRayContext();
  const architectAgent = makeArchitectAgent(ray);
  const tools = makeArchitectTools(llm, ray);

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
