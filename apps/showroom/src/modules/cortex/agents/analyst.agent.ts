// Analyst specialist for the research-desk demo: takes raw research
// findings and produces a structured assessment.

import { z } from 'zod';
import { defineAgent } from '@niscorp/cortex';

export const AnalysisSchema = z.object({
  claim: z.string().describe('The main claim derived from the research.'),
  confidence: z.number().min(0).max(1).describe('Confidence in the claim, 0-1.'),
  keyPoints: z.array(z.string()).describe('Key supporting points from the research.'),
});

export type Analysis = z.infer<typeof AnalysisSchema>;

export const analystAgent = defineAgent<Analysis>({
  id: 'desk.analyst',
  name: 'Analyst',
  description: 'Analyzes research findings and produces a structured assessment.',
  instructions:
    'You are an analyst. You will receive research findings as input. ' +
    'Analyze them and return a structured assessment with a main claim, confidence score, and key points. ' +
    'Be objective. Confidence should reflect the strength of evidence.',
  outputMode: 'structured',
  outputSchema: AnalysisSchema,
});
