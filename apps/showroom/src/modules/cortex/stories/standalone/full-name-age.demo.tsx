import { runAgentStandalone } from '@niscorp/cortex';
import { createSignal } from '@niscorp/signal';
import { mappingAgent, type MappingAgentOutput } from '@niscorp/prism/agent';
import agentSource from '@packages/prism/src/agent/mapping-agent.ts?raw';
import type { JsonObject } from '@niscorp/prism';
import { DEFAULT_MODEL, PROVIDER, PrismMappingDemo, type Runner } from '@showroom/modules/cortex/atoms';

const agent = mappingAgent;
const sampleInput: JsonObject = { first: 'Ada', last: 'Lovelace', born: 1815 };
const expected = { fullName: 'Ada Lovelace', age: 211 };
const fieldDescriptions = {
  fullName: 'first and last joined with a single space.',
  age: 'Years between `born` and 2026 (the current year).',
};

// The mapping agent's outputSchema embeds Prism's ConfigSchema —
// so the entire Prism Node tree is validated end-to-end on every
// call. The orchestrator runs the returned config against
// sampleInput and compares to expected.
const runner: Runner<MappingAgentOutput> = ({ apiKey, client, onRetry }) => {
  const llm = createSignal(PROVIDER, { client, model: DEFAULT_MODEL, apiKey });
  return runAgentStandalone<MappingAgentOutput>(
    agent,
    { sampleInput, targetShape: expected, fieldDescriptions },
    { llm, onRetry },
  );
};

export { agent, sampleInput, expected, fieldDescriptions, agentSource };

export const Demo = () => (
  <PrismMappingDemo
    storyId="standalone.prism-mapping.full-name-age"
    sampleInput={sampleInput}
    expected={expected}
    fieldDescriptions={fieldDescriptions}
    runner={runner}
  />
);
