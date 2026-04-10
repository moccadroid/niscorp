// ═══════════════════════════════════════════════════════════
// Structured-extract demo: a generic structured-mode agent
// ═══════════════════════════════════════════════════════════
//
// Pulls structured fields out of free-form text and returns a typed
// object. Demonstrates Cortex's `outputMode: 'structured'` with a
// schema that has zero dependencies on Prism (or anything else).
//
// This is the demo a user should look at first to understand "what
// does Cortex do for me when I just want JSON out of an LLM call?"
// — the answer is: validation, retry-with-feedback, type narrowing,
// and a one-line invocation.

import { z } from 'zod';
import { defineAgent } from '@niscorp/cortex';

// ───────────────────────────────────────────────────────────
// Person extractor
// ───────────────────────────────────────────────────────────

export const PersonSchema = z
  .object({
    name: z.string().describe('The full name of the person, exactly as it appears in the text.'),
    age: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .describe('Age in years, or null if not stated.'),
    occupation: z
      .string()
      .nullable()
      .describe('Job title or role, or null if not stated.'),
    location: z
      .string()
      .nullable()
      .describe('City, country, or other location identifier, or null if not stated.'),
  })
  .strict();

export type Person = z.infer<typeof PersonSchema>;

export const personExtractorAgent = defineAgent<Person>({
  id: 'demo.structured.person-extractor',
  name: 'Person Extractor',
  description:
    'Extracts a structured Person record from a paragraph of free-form text. Generic structured-output demo.',
  instructions:
    'Extract the person described in the user input. Return a JSON object matching the schema. ' +
    'If a field is not stated, return null for that field. No prose, no markdown fences, no extra fields.',
  outputMode: 'structured',
  outputSchema: PersonSchema,
});
