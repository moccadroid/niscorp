import { routeResponse, type StepRequest, type StepResult } from '@niscorp/signal';
import type { CortexEvent, SignalClient } from '@niscorp/cortex';
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
const broken = JSON.stringify({ action: { ...screen, triggers: [] }, probes: [] });
const working = JSON.stringify({ action: screen, probes: [{ do: [{ set: 'search', to: 'zzzz' }], changes: 'rows' }] });

// A model that calls discover once, then answers with the next of its answers every step, the last one again and again.
const stubModel = (answers: readonly string[]): { llm: SignalClient; answered: () => number } => {
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
  return { llm, answered: () => at };
};

await getVexRuntime();
const setup = screenSetup(devRayContext());
const checks: [string, boolean][] = [];

const fixed = stubModel([broken, working]);
const refusals: string[] = [];
const outcome = await buildScreen('a deals list with a search box', setup, { llm: fixed.llm, onEvent: (event: CortexEvent) => { if (event.type === 'retry') refusals.push(String(event.issues)); } });
checks.push([
  `an answer carrying a screen is checked: the first refused (${refusals[0]?.slice(0, 100) ?? 'none'}), the second ends the build (${outcome.ok ? 'passed' : outcome.error})`,
  outcome.ok && fixed.answered() === 2 && refusals.length === 1 && refusals[0]?.includes('has no trigger') === true,
]);

const stuck = stubModel([broken]);
const repeated = await buildScreen('a deals list with a search box', setup, { llm: stuck.llm });
checks.push([
  `the same screen answered three times ends the run, and the repair ends the same way after three more (${stuck.answered()} answers; ${repeated.ok ? 'passed' : repeated.error})`,
  !repeated.ok && repeated.error.includes('the same screen came back') && stuck.answered() === 6,
]);

for (const [name, ok] of checks) console.log(`${ok ? '✓' : '✗'} ${name}`);
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
