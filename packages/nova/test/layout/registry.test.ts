import { describe, expect, it } from 'vitest';
import { createComponentRegistry } from '@layout';

describe('component registry', () => {
  it('registers and retrieves entries', () => {
    const reg = createComponentRegistry();
    const component = { mock: true };
    reg.register('Text', component, { description: 'd' });
    const entry = reg.get('Text');
    expect(entry?.component).toBe(component);
    expect(entry?.meta.description).toBe('d');
    expect(reg.has('Text')).toBe(true);
    expect(reg.has('Other')).toBe(false);
    expect(reg.list()).toEqual(['Text']);
  });

  it('registers without explicit meta', () => {
    const reg = createComponentRegistry();
    reg.register('Bare', { id: 1 });
    const entry = reg.get('Bare');
    expect(entry?.meta).toEqual({});
  });

  it('returns undefined for missing', () => {
    const reg = createComponentRegistry();
    expect(reg.get('nope')).toBeUndefined();
  });
});
