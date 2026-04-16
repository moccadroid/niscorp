import { runAgentStandalone } from '@niscorp/cortex';
import { createSignal } from '@niscorp/signal';
import { mappingAgent, type MappingAgentOutput } from '@niscorp/prism/agent';
import agentSource from '@packages/prism/src/agent/mapping-agent.ts?raw';
import type { JsonObject } from '@niscorp/prism';
import { DEFAULT_MODEL, PROVIDER, PrismMappingDemo, type Runner } from '@showroom/modules/cortex/atoms';

const agent = mappingAgent;
const sampleInput: JsonObject = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  address: { city: 'Berlin', country: 'DE' },
};
const expected = { name: 'Jane Doe', email: 'jane@example.com', city: 'Berlin', country: 'DE' };
const fieldDescriptions = {
  city: 'Read from address.city.',
  country: 'Read from address.country.',
};

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
    storyId="standalone.prism-mapping.flatten-contact"
    sampleInput={sampleInput}
    expected={expected}
    fieldDescriptions={fieldDescriptions}
    runner={runner}
  />
);
