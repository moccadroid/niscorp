import { describe, expect, it } from 'vitest';
import {
  createComponentRegistry,
  createLayoutStore,
  renderLayout,
} from '@layout';
import type { LayoutNode, RenderContext } from '@layout';
import { ComponentNotFoundError, LayoutRefNotFoundError, NovaError, RenderError } from '@shared';
import { createPermissiveRegistry } from '../helpers';

const makeStrictCtx = (
  onError?: (e: NovaError) => void,
): RenderContext => ({
  store: createLayoutStore(),
  registry: createComponentRegistry(),
  strict: true,
  ...(onError === undefined ? {} : { onError }),
});

const makeLaxCtx = (
  onError?: (e: NovaError) => void,
): RenderContext => ({
  store: createLayoutStore(),
  registry: createComponentRegistry(),
  strict: false,
  ...(onError === undefined ? {} : { onError }),
});

describe('renderLayout — component-not-found', () => {
  it('lax mode emits an error node and calls onError', () => {
    const errors: NovaError[] = [];
    const out = renderLayout(
      { component: 'Missing' },
      {},
      makeLaxCtx((e) => errors.push(e)),
    );
    expect(out).toEqual([
      { type: 'error', code: 'COMPONENT_NOT_FOUND', message: expect.stringContaining('Missing') },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(ComponentNotFoundError);
  });

  it('strict mode throws ComponentNotFoundError', () => {
    expect(() => renderLayout({ component: 'Missing' }, {}, makeStrictCtx())).toThrow(
      ComponentNotFoundError,
    );
  });
});

describe('renderLayout — layoutref-not-found', () => {
  it('lax mode emits an error node', () => {
    const errors: NovaError[] = [];
    const out = renderLayout({ ref: 'nope' }, {}, makeLaxCtx((e) => errors.push(e)));
    expect(out[0]?.type).toBe('error');
    expect(errors[0]).toBeInstanceOf(LayoutRefNotFoundError);
  });

  it('strict mode throws', () => {
    expect(() => renderLayout({ ref: 'nope' }, {}, makeStrictCtx())).toThrow(
      LayoutRefNotFoundError,
    );
  });
});

describe('renderLayout — subtree isolation', () => {
  it('error in one sibling does not break other siblings in lax mode', () => {
    const registry = createPermissiveRegistry();
    const layout: LayoutNode = {
      component: 'Stack',
      children: [
        { component: 'Text', props: { value: 'a' } },
        { ref: 'missing' },
        { component: 'Text', props: { value: 'b' } },
      ],
    };
    const ctx: RenderContext = {
      store: createLayoutStore(),
      registry,
      strict: false,
    };
    const out = renderLayout(layout, {}, ctx);
    const stack = out[0];
    if (!stack || stack.type !== 'component') throw new Error('expected stack');
    expect(stack.children).toHaveLength(3);
    expect(stack.children[0]?.type).toBe('component');
    expect(stack.children[1]?.type).toBe('error');
    expect(stack.children[2]?.type).toBe('component');
  });
});
