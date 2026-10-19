import { routeResponse, type StepRequest, type StepResult } from '@niscorp/signal';
import type { SignalClient } from '@niscorp/cortex';
import { buildScreen } from '@relay/screen-builder';
import { screenSetup } from '@relay/server/functions/ray/screens';
import { getVexRuntime, devRayContext } from './engine';

const screen = {
  id: 'stub.deals',
  name: 'Deals',
  data: { rows: [], search: '' },
  layout: { component: 'Stack', children: [{ component: 'Input', ref: 'search', model: '$.search' }, { component: 'Table', props: { rows: '$.rows', rowKey: 'deal_id', empty: 'None.', columns: [{ label: 'Title', cell: { kind: 'primary', key: 'title' } }] } }] },
  triggers: [{ event: 'ui:model', ref: 'search', do: [{ call: 'load' }] }],
  endpoints: { load: { url: '/api/vex', method: 'POST', request: { fingerprint: 'deals/list', context: { q: { $join: { parts: ['%', { $ref: '$.search' }, '%'], sep: '' } } } }, target: 'rows' } },
  lifecycle: { mount: [{ call: 'load' }] },
};
const answers = [
  JSON.stringify({ action: { ...screen, triggers: [] }, probes: [] }),
  JSON.stringify({ action: screen, probes: [{ do: [{ set: 'search', to: 'zzzz' }], changes: 'rows' }] }),
];
let at = 0;
let discovered = false;
const answer = (request: StepRequest): StepResult => {
  const declared = new Set((request.tools ?? []).map((tool) => tool.name));
  const toolCalls = discovered ? [] : [{ id: 'call-1', name: 'discover', args: {} }];
  const content = discovered ? (answers[Math.min(at, answers.length - 1)] ?? '') : '';
  if (discovered) at += 1;
  discovered = true;
  const base: StepResult = { content, toolCalls, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, reported: true }, finishReason: toolCalls.length > 0 ? 'tool_calls' : 'stop', raw: null };
  if (request.output === undefined) return base;
  const routed = routeResponse({ content, toolCalls, declared, accept: request.output.accept, responseStrategies: [] });
  return { ...base, outcome: routed.outcome, wire: routed.wire };
};
const llm: SignalClient = {
  step: async (request) => answer(request),
  stepStream: (request) => {
    const result = answer(request);
    return (async function* () {
      yield { type: 'text' as const, text: result.content };
      yield { type: 'done' as const, result };
    })();
  },
  count: async () => 1,
  describe: () => ({ provider: 'stub', model: 'stub', kind: 'chat', modelKnown: false, capabilities: { nativeTools: true, nativeJsonSchema: false, nativeJsonMode: true, toolsWithStructuredOutput: false, validatesToolArgs: true, manglesNestedToolArgs: false, multimodal: false, supportsEmbedding: false } }),
};

await getVexRuntime();
// A stub model that answers with the screen instead of calling check: its first answer is refused with what the check found, its second passes and ends the build.
const refusals: string[] = [];
const outcome = await buildScreen('a deals list with a search box', screenSetup(devRayContext()), { llm, onEvent: (event) => { if (event.type === 'retry') refusals.push(String(event.issues)); } });
const ok = outcome.ok && at === 2 && refusals.length === 1 && refusals[0]?.includes('has no trigger') === true;
console.log(`${ok ? '✓' : '✗'} an answer carrying a screen is checked: the first refused (${refusals[0]?.slice(0, 120) ?? 'none'}), the second ends the build (${outcome.ok ? 'passed' : outcome.error})`);
process.exit(ok ? 0 : 1);
