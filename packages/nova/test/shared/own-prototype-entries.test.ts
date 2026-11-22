import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createShell } from '@shell';
import { createScopeChain, getPath, resolve } from '@shared/bindings';

const later = (ms = 5): Promise<void> => new Promise((settle) => setTimeout(settle, ms));

describe('one rule for names a record inherits: its own prototype counts, Object.prototype does not', () => {
  it('a path does not read what every object inherits', () => {
    expect(getPath({ x: {} }, 'x.constructor')).toBeUndefined();
    expect(resolve('x={{$.x.toString}}', createScopeChain({ x: {} }))).toBe('x=');
    expect(resolve('$.constructor', createScopeChain({}))).toBeUndefined();
  });

  it('a path still reads a getter of a class the data holds', () => {
    class Person { constructor(readonly first: string, readonly last: string) {} get full(): string { return `${this.first} ${this.last}`; } }
    expect(getPath({ p: new Person('Ada', 'Lovelace') }, 'p.full')).toBe('Ada Lovelace');
  });

  it('a function the functions object inherits from its own prototype is called', async () => {
    const functions = Object.create({ hello: async () => 'hi' });
    const a: ActionDefinition = { id: 'a', data: { r: null }, endpoints: { h: { fn: 'hello', target: 'r' } }, lifecycle: { mount: [{ call: 'h' }] }, layout: { component: 'Text', children: 'x' } };
    const shell = createShell({ canvases: [{ id: 'main' }], actions: { a }, functions });
    const id = shell.push('main', 'a');
    await later();
    expect(shell.getRuntime(id)?.getData()['r']).toBe('hi');
  });

  it('a name every object inherits is still not a function', async () => {
    const errors: string[] = [];
    const a: ActionDefinition = { id: 'a', data: {}, endpoints: { h: { fn: 'toString' } }, lifecycle: { mount: [{ call: 'h' }] }, layout: { component: 'Text', children: 'x' } };
    const shell = createShell({ canvases: [{ id: 'main' }], actions: { a }, functions: {}, onError: (e) => errors.push(e.code) });
    shell.push('main', 'a');
    await later();
    expect(errors).toEqual(['LIFECYCLE_ERROR']);
  });
});
