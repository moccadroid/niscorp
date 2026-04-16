import { runAgentStandalone } from '@niscorp/cortex';
import { createSignal } from '@niscorp/signal';
import { personExtractorAgent } from '@showroom/modules/cortex/agents/person-extractor.agent';
import agentSource from '@showroom/modules/cortex/agents/person-extractor.agent?raw';
import { DEFAULT_MODEL, PROVIDER, StructuredExtractDemo, type Runner } from '@showroom/modules/cortex/atoms';

const agent = personExtractorAgent;
const inputText =
  "Ada Lovelace was a 19th-century English mathematician living in London. She is regarded as the first computer programmer for her work on Charles Babbage's Analytical Engine. She died in 1852 at the age of 36.";
const expectedFields = { name: 'Ada Lovelace', age: 36, location: 'London' };

// Build the SignalClient (signal is the LLM transport — provider,
// model, API key) and hand it to Cortex's standalone runner. One
// call, validated against the agent's outputSchema, parsed to a
// typed Person, auto-retries on validation failure.
const runner: Runner = ({ apiKey, client, onRetry }) => {
  const llm = createSignal(PROVIDER, { client, model: DEFAULT_MODEL, apiKey });
  return runAgentStandalone(agent, inputText, { llm, onRetry });
};

export { agent, inputText, expectedFields, agentSource };

export const Demo = () => (
  <StructuredExtractDemo
    storyId="standalone.extract.ada"
    inputText={inputText}
    expectedFields={expectedFields}
    runner={runner}
  />
);
