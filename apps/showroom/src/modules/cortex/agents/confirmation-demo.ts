// ═══════════════════════════════════════════════════════════
// Confirmation flow demo — human-in-the-loop tool approval
// ═══════════════════════════════════════════════════════════

import { z } from 'zod';
import { defineAgent, defineTool } from '@niscorp/cortex';

export const checkBalanceTool = defineTool({
  id: 'demo.check_balance',
  name: 'check_balance',
  description: 'Checks the account balance for a given user. Safe, read-only.',
  riskLevel: 'low',
  input: z.object({
    userId: z.string().describe('The user ID to check.'),
  }),
  execute: async ({ userId }) => {
    const balances: Record<string, number> = {
      alice: 2_500,
      bob: 850,
      carol: 12_000,
    };
    const balance = balances[userId.toLowerCase()];
    if (balance === undefined) return { error: `No account for ${userId}` };
    return { userId, balance, currency: 'USD' };
  },
});

export const transferFundsTool = defineTool({
  id: 'demo.transfer_funds',
  name: 'transfer_funds',
  description: 'Transfers funds between accounts. Requires human approval before execution.',
  riskLevel: 'high',
  input: z.object({
    from: z.string().describe('Source user ID.'),
    to: z.string().describe('Destination user ID.'),
    amount: z.number().positive().describe('Amount in USD.'),
  }),
  execute: async ({ from, to, amount }) => {
    return { status: 'completed', from, to, amount, transactionId: `TXN-${Date.now()}` };
  },
});

export const financialAgent = defineAgent({
  id: 'demo.financial',
  name: 'Financial Agent',
  description: 'Manages account queries and fund transfers.',
  instructions:
    'You are a financial assistant. You can check balances with check_balance and transfer funds with transfer_funds. ' +
    'When the user asks for a transfer, first check the sender\'s balance to make sure they have enough, then execute the transfer. ' +
    'If a tool call is denied or times out waiting for confirmation, inform the user that the operation requires approval and was not completed.',
  outputMode: 'text',
  tools: ['demo.check_balance', 'demo.transfer_funds'],
  policy: {
    tools: {
      requireConfirmation: ['demo.transfer_funds'],
    },
    confirmationTimeoutMs: 30_000,
  },
});
