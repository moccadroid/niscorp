import { z } from 'zod';
import { defineAgent, defineTool } from '@niscorp/cortex';
import { RunPanel } from '../atoms/run-panel';

// Human-in-the-loop: policy marks transfer_funds as requiring
// approval. The gate runs BEFORE execution; the run suspends on
// approval-required and the buttons below resolve it. A denial is an
// observation the model reacts to — the run continues either way.

const balances: Record<string, number> = { checking: 2400, savings: 9100 };

const checkBalance = defineTool({
  id: 'check_balance',
  name: 'check_balance',
  description: 'Reads the balance of an account.',
  riskLevel: 'low',
  input: z.object({ account: z.enum(['checking', 'savings']) }),
  execute: ({ account }) => ({ account, balance: balances[account] }),
});

const transferFunds = defineTool({
  id: 'transfer_funds',
  name: 'transfer_funds',
  description: 'Moves money between the two accounts.',
  riskLevel: 'high',
  input: z.object({
    from: z.enum(['checking', 'savings']),
    to: z.enum(['checking', 'savings']),
    amount: z.number().positive(),
  }),
  execute: ({ from, to, amount }) => `transferred ${amount} from ${from} to ${to}`,
});

const banker = defineAgent({
  id: 'demo.banker',
  description: 'A cautious banking assistant.',
  instructions:
    'You manage two accounts (checking, savings). Check balances before transferring. Report what happened — including a denial — in your response.',
  tools: [checkBalance, transferFunds],
  policy: { tools: { requireApproval: ['transfer_funds'] } },
});

export const Demo = () => (
  <RunPanel
    initialInput="Move 500 from savings to checking."
    makeRun={(llm, input, onEvent) => banker.run(input, { llm, onEvent })}
  />
);
