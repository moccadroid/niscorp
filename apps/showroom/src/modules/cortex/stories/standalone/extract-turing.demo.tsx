import { runAgentStandalone } from '@niscorp/cortex';
import { createSignal } from '@niscorp/signal';
import { personExtractorAgent } from '@showroom/modules/cortex/agents/person-extractor.agent';
import agentSource from '@showroom/modules/cortex/agents/person-extractor.agent?raw';
import { DEFAULT_MODEL, PROVIDER, StructuredExtractDemo, type Runner } from '@showroom/modules/cortex/atoms';

const agent = personExtractorAgent;
const inputText =
  'Alan Turing was a British mathematician and computer scientist who broke German codes during WWII.';
const expectedFields = { name: 'Alan Turing' };

const runner: Runner = ({ apiKey, client, onRetry }) => {
  const llm = createSignal(PROVIDER, { client, model: DEFAULT_MODEL, apiKey });
  return runAgentStandalone(agent, inputText, { llm, onRetry });
};

export { agent, inputText, expectedFields, agentSource };

export const Demo = () => (
  <StructuredExtractDemo
    storyId="standalone.extract.turing"
    inputText={inputText}
    expectedFields={expectedFields}
    runner={runner}
  />
);
