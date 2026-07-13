import { z } from 'zod';
import { defineAgent } from '@niscorp/cortex';
import { RunPanel } from '../atoms/run-panel';

// Structured extraction: the payload schema types `data` end-to-end.
// On Groq this resolves to the respond strategy (tools + response_format
// don't combine there); the schema rides the respond tool's parameters
// and Zod validates the envelope — failures feed back in-loop.

const PersonSchema = z.object({
  name: z.string().describe('Full name.'),
  age: z.number().describe('Age in years.'),
  occupation: z.string().optional().describe('Occupation, when stated.'),
});

const extractor = defineAgent({
  id: 'demo.extract',
  description: 'Extracts a person from prose.',
  instructions: 'Extract the person described in the input.',
  output: { schema: PersonSchema },
});

export const Demo = () => (
  <RunPanel
    initialInput="Ada Lovelace was 36 when she died in 1852; she worked as a mathematician on the Analytical Engine."
    makeRun={(llm, input, onEvent) => extractor.run(input, { llm, onEvent })}
  />
);
