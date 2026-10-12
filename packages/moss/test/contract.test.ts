import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { buildContract, contractAsMarkdown } from '../src/integrations/operator';
import type { ContractHost } from '../src/integrations/operator';

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
    Plain: {},
  },
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
