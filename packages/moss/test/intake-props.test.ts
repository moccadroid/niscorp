import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { endlessChains, layoutMisfits } from '../src/manifest';
import { runIntake } from '../src/integrations/intake';
import type { IntakeContext } from '../src/integrations/intake';

const Choice = z
  .object({
    label: z.string().optional(),
    emphasis: z.enum(['gold', 'silver', 'bronze', 'none']).optional(),
    count: z.number().optional(),
  })
  .strict();

const ctx = (): IntakeContext => ({
  integrationId: 'acme',
  url: 'https://acme.example',
  layoutMisfits: (layout) =>
    layoutMisfits(
      layout,
      new Map<string, { propsSchema?: unknown }>([
        ['Choice', { propsSchema: Choice }],
        ['Plain', {}],
      ]),
    ),
  endlessChains,
  fingerprints: new Set<string>(),
});

const withLayout = (layout: unknown): unknown => ({
  integration: 'acme',
  actions: { 'ext.staff.acme.desk': { id: 'ext.staff.acme.desk', layout } },
});

const intake = (layout: unknown): ReturnType<typeof runIntake> => runIntake(withLayout(layout), ctx());
const reasonsOf = (r: ReturnType<typeof runIntake>): string[] => (r.ok ? [] : r.reasons);

describe('runIntake — a component with a schema has its props checked', () => {
  it('refuses an unknown prop', () => {
    const result = intake({ component: 'Choice', props: { submitRef: 'send' } });
    expect(result.ok).toBe(false);
    expect(reasonsOf(result)).toContainEqual(expect.stringContaining('"Choice" has no prop "submitRef"'));
  });

  it('refuses a value outside the closed set', () => {
    const result = intake({ component: 'Choice', props: { emphasis: 'platinum' } });
    expect(result.ok).toBe(false);
    expect(reasonsOf(result)).toContainEqual(expect.stringContaining('prop "emphasis"'));
  });

  it('refuses a value of the wrong type', () => {
    const result = intake({ component: 'Choice', props: { count: 'lots' } });
    expect(result.ok).toBe(false);
    expect(reasonsOf(result)).toContainEqual(expect.stringContaining('prop "count"'));
  });

  it('accepts valid static props', () => {
    expect(intake({ component: 'Choice', props: { label: 'Go', emphasis: 'gold', count: 3 } }).ok).toBe(true);
  });
});

describe('runIntake — a deferred value has its key checked, its value skipped', () => {
  it('accepts a binding on a known prop, whatever its type would be', () => {
    expect(intake({ component: 'Choice', props: { count: '$.total' } }).ok).toBe(true);
  });

  it('accepts a directive object on a known prop', () => {
    expect(intake({ component: 'Choice', props: { count: { $if: '$.admin', then: 5, else: 0 } } }).ok).toBe(true);
  });

  it('still refuses an unknown prop even when its value is a binding', () => {
    const result = intake({ component: 'Choice', props: { submitRef: '$.x' } });
    expect(result.ok).toBe(false);
    expect(reasonsOf(result)).toContainEqual(expect.stringContaining('"Choice" has no prop "submitRef"'));
  });
});

describe('runIntake — the name check is unchanged', () => {
  it('a component with no schema is checked by name alone', () => {
    expect(intake({ component: 'Plain', props: { whatever: 1, and: 'this' } }).ok).toBe(true);
  });

  it('an unknown component name is still refused', () => {
    const result = intake({ component: 'Ghost', props: {} });
    expect(result.ok).toBe(false);
    expect(reasonsOf(result)).toContainEqual(expect.stringContaining('layout uses "Ghost"'));
  });
});
