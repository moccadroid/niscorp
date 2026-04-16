// Customer support agent + sentiment-analysis tool. Used by the
// support-escalation rules story (the escalation rule lives there).

import { z } from 'zod';
import { defineAgent, defineTool } from '@niscorp/cortex';

export const sentimentTool = defineTool({
  id: 'demo.analyze_sentiment',
  name: 'analyze_sentiment',
  description: 'Analyzes the sentiment of a text. Returns a score from 0 (negative) to 1 (positive).',
  riskLevel: 'low',
  input: z.object({
    text: z.string().describe('The text to analyze.'),
  }),
  execute: async ({ text }) => {
    const lower = text.toLowerCase();
    const negative = [
      'angry',
      'frustrated',
      'terrible',
      'awful',
      'hate',
      'worst',
      'unacceptable',
      'furious',
      'broken',
      'useless',
    ];
    const positive = ['great', 'thanks', 'good', 'love', 'excellent', 'happy', 'wonderful', 'perfect'];
    const negCount = negative.filter((w) => lower.includes(w)).length;
    const posCount = positive.filter((w) => lower.includes(w)).length;
    const raw = posCount - negCount;
    const score = Math.max(0, Math.min(1, 0.5 + raw * 0.2));
    return { score, analysis: score < 0.3 ? 'negative' : score > 0.7 ? 'positive' : 'neutral' };
  },
});

export const supportAgent = defineAgent({
  id: 'demo.support',
  name: 'Support Agent',
  description: 'Handles customer inquiries with empathy.',
  instructions:
    'You are a customer support agent for a software company. ' +
    "First, use the analyze_sentiment tool on the user's message to gauge their mood. " +
    'Then respond helpfully based on their inquiry. ' +
    'If you see a system message about escalation or negative sentiment, immediately switch to a deeply empathetic tone, apologize sincerely, and offer concrete next steps (refund, manager callback, priority ticket). ' +
    'Keep your response under 3 sentences.',
  outputMode: 'text',
  tools: ['demo.analyze_sentiment'],
});
