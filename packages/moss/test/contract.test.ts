import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { buildContract, contractAsMarkdown } from '../src/integrations/contract';
import type { ContractHost } from '../src/integrations/contract';

// ═══════════════════════════════════════════════════════════════
// The contract carries each component's SHAPE, not just its name. An add-on
// author shares no code with the host, so the contract is the only place they
// learn that `emphasis` is a closed set of four values and not any string. The
// props schema is derived — through nova's paletteEntryOf — from the same Zod
// schema the renderer validates against, so what the contract advertises and
// what the app enforces cannot drift. A component registered with no meta is
// still listed, by name alone.
// ═══════════════════════════════════════════════════════════════

// What the contract is made of: the charter and the kit's components, as the
// server hands them over, and the seats and hubs the app named.
const host: ContractHost = {
  charter: {},
  components: {
    Badge: {
      meta: {
        description: 'A small status chip.',
        propsSchema: z
          .object({
            emphasis: z.enum(['gold', 'silver', 'bronze', 'none']).describe("the chip's weight"),
            label: z.string().describe('the text shown'),
          })
          .strict(),
      },
    },
    // No meta: the host handed moss a bare name, and the contract loses nothing.
    Plain: {},
  },
  attachable: {},
  menuSlots: [],
};

describe('buildContract — components carry description and props', () => {
  it('enriches a component that has meta', () => {
    const badge = buildContract(host, 'acme').components.find((c) => c.name === 'Badge');
    expect(badge?.description).toBe('A small status chip.');
    const props = (badge?.propsSchema as { properties?: Record<string, { enum?: unknown }> } | undefined)?.properties;
    expect(props?.emphasis?.enum).toEqual(['gold', 'silver', 'bronze', 'none']);
    expect(props).toHaveProperty('label');
  });

  it('lists a meta-less component by name alone', () => {
    const plain = buildContract(host, 'acme').components.find((c) => c.name === 'Plain');
    expect(plain).toEqual({ name: 'Plain', description: '' });
  });

  it('lists a component whose props schema cannot describe itself by its name and description', () => {
    // A JSON Schema where a zod schema was expected: nothing converts it, so
    // the contract shows what it can and the route does not throw on it.
    const odd = buildContract({ ...host, components: { Odd: { meta: { description: 'An odd one.', propsSchema: { type: 'object' } } } } }, 'acme');
    expect(odd.components).toEqual([{ name: 'Odd', description: 'An odd one.' }]);
  });
});

describe('contractAsMarkdown — the props table', () => {
  const md = contractAsMarkdown(buildContract(host, 'acme'), []);

  it('prints the description and a props table', () => {
    expect(md).toContain('**Badge** — A small status chip.');
    expect(md).toContain('| prop | type | required | meaning |');
  });

  it('surfaces the closed set, not a bare "string" — the whole point', () => {
    expect(md).toContain('one of: gold, silver, bronze, none');
    expect(md).toMatch(/\| emphasis \| one of: gold, silver, bronze, none \| yes \| the chip's weight \|/);
  });

  it('still lists a component with no props, by name', () => {
    expect(md).toContain('**Plain**');
  });
});
