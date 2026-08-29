import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { runIntake } from '../src/integrations';
import type { IntakeContext } from '../src/integrations';

// ═══════════════════════════════════════════════════════════════
// Intake checks a layout's component NAMES and, when the app carried a props
// schema for a component, its PROPS. A bundle shipping a prop the component does
// not have — a wrong key, a value outside a closed set — used to install
// cleanly and do nothing under a customer's finger; the kit's strict schema is
// exactly what refuses it, and intake is the only place a bundle arriving over
// HTTP passes through. A prop whose value is deferred to render time (a binding,
// a directive) has its key checked and its value left alone.
// ═══════════════════════════════════════════════════════════════

// A component with a strict schema, and one the app handed moss by name alone.
const Choice = z
  .object({
    label: z.string().optional(),
    emphasis: z.enum(['gold', 'silver', 'bronze', 'none']).optional(),
    count: z.number().optional(),
  })
  .strict();

const ctx = (): IntakeContext => ({
  integrationId: 'acme',
  components: new Map<string, { propsSchema?: unknown }>([
    ['Choice', { propsSchema: Choice }],
    ['Plain', {}], // no schema — name-only, as before
  ]),
  fingerprints: new Set<string>(),
  attachable: new Set<string>(),
  menuSlots: new Set<string>(),
});

// One action carrying one layout node, namespaced so only the props check can
// fail it.
const withLayout = (layout: unknown): unknown => ({
  integration: 'acme',
  meta: {},
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
    // count is a number; `$.total` is a string that resolves at render time.
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
