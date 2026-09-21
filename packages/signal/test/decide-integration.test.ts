import { describe, it, expect } from 'vitest';
import { createSignal } from '../src';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '..', '.env') });

const hasTypeSafeKey = !!process.env['TYPESAFE_API_KEY'];

describe.skipIf(!hasTypeSafeKey)('TypeSafe decision integration', () => {
  const jev = createSignal('typesafe');

  it('answers all three question types, calibrated', async () => {
    const result = await jev.decide({
      state: { message: 'I was charged twice for order 7429', verified: true },
      questions: {
        intent: {
          type: 'choice',
          instructions: 'What is the customer asking for?',
          criteria: { refund: 'Money back', bug: 'A defect report', other: 'Anything else' },
        },
        needsHuman: { type: 'noul', instructions: 'Does this need a person?' },
        urgency: { type: 'score', instructions: 'How urgent is it?', criteria: ['Low', 'Medium', 'High'] },
      },
    });

    // The gate already held every answer to its question; what is left to see
    // is that a real provider reports what a caller meters on.
    expect(result.calibrated).toBe(true);
    expect(['refund', 'bug', 'other']).toContain(result.decisions.intent.choice);
    expect(result.decisions.urgency.level).toBeGreaterThanOrEqual(0);
    expect(result.meta.usage.reported).toBe(true);
    expect(result.meta.durationMs).toBeGreaterThan(0);
  }, 15000);
});
