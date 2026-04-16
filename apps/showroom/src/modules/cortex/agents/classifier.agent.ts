// Specialist agent for the director plan-mode demo: classifies the
// input text into a category. Mounted as a specialist via ask_agent.
// Includes the structured output schema it returns.

import { z } from 'zod';
import { defineAgent } from '@niscorp/cortex';

export const ClassificationSchema = z
  .object({
    category: z.enum(['news', 'opinion', 'tutorial', 'fiction', 'other']),
    confidence: z.number().min(0).max(1).describe('Confidence in the category, 0–1.'),
  })
  .strict();

export type Classification = z.infer<typeof ClassificationSchema>;

export const classifierAgent = defineAgent<Classification>({
  id: 'demo.plan.classifier',
  name: 'Classifier',
  description: 'Classifies the input text into a category.',
  instructions:
    'Classify the user input into one of: news, opinion, tutorial, fiction, other. Return JSON {category, confidence}. No prose.',
  outputMode: 'structured',
  outputSchema: ClassificationSchema,
});
