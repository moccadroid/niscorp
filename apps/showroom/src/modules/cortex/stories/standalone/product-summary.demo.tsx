import { runAgentStandalone } from '@niscorp/cortex';
import { createSignal } from '@niscorp/signal';
import { mappingAgent, type MappingAgentOutput } from '@niscorp/prism/agent';
import agentSource from '@packages/prism/src/agent/mapping-agent.ts?raw';
import type { JsonObject } from '@niscorp/prism';
import { DEFAULT_MODEL, PROVIDER, PrismMappingDemo, type Runner } from '@showroom/modules/cortex/atoms';

const agent = mappingAgent;
const sampleInput: JsonObject = {
  sku: 'SKU-42',
  name: 'Mechanical Keyboard',
  price: 149.99,
  currency: 'USD',
  stock: 7,
};
const expected = { title: 'Mechanical Keyboard', priceLabel: 'USD 149.99', inStock: true };
const fieldDescriptions = {
  title: 'Just the product name.',
  priceLabel: 'currency followed by a space then the price.',
  inStock: 'true if stock is greater than zero.',
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
    storyId="standalone.prism-mapping.product-summary"
    sampleInput={sampleInput}
    expected={expected}
    fieldDescriptions={fieldDescriptions}
    runner={runner}
  />
);
