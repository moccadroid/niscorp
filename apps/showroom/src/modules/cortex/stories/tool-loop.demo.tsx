import { z } from 'zod';
import { defineAgent, defineTool } from '@niscorp/cortex';
import { RunPanel } from '../atoms/run-panel';

// The loop: model → tool → model → respond. Watch the event pane:
// tool-start fires BEFORE execution (live UIs), tool-end carries the
// typed observation, and the run ends only when respond validates.

const calculator = defineTool({
  id: 'calculator',
  name: 'calculator',
  description: 'Evaluates one arithmetic expression, e.g. "(2+3)*7".',
  input: z.object({ expression: z.string() }),
  execute: ({ expression }) => {
    if (!/^[\d\s+\-*/().%]+$/.test(expression)) return 'error: only arithmetic characters allowed';
    return new Function(`return (${expression})`)() as number;
  },
});

const mathAgent = defineAgent({
  id: 'demo.math',
  description: 'Arithmetic with a tool.',
  instructions:
    'Use the calculator tool for EVERY arithmetic step — never compute in your head. Then finish with respond: data.answer plus a short reasoning.',
  tools: [calculator],
  output: { schema: z.object({ answer: z.number() }) },
});

export const Demo = () => (
  <RunPanel
    initialInput="A crate holds 17 boxes of 23 apples. 4 crates arrive but 61 apples are bruised. How many good apples?"
    makeRun={(llm, input, onEvent) => mathAgent.run(input, { llm, onEvent })}
  />
);
