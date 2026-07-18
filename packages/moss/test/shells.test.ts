import { describe, it, expect } from 'vitest';
import { createShellHost } from '../src/shells';
import type { ShellHostContext } from '../src/shells';
import type { NiscApp } from '../src/app';
import type { ScopePolicy } from '@niscorp/vex';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

// A minimal app with a server shell: one canvas, one action whose click
// increments its own counter. No endpoints (so no wire/transform needed).
const counter = {
  id: 'counter',
  data: { n: 0 },
  triggers: [{ event: 'ui:click', ref: 'bump', do: [{ increment: 'n' }] }],
};
const app = {
  charter: { public: ['counter'] },
  assignments: {},
  actions: { counter },
  shell: { canvases: [{ id: 'main', initial: 'counter' }] },
} as unknown as NiscApp;

const policy: ScopePolicy = { default: 'deny', entities: {} };

const ctx: ShellHostContext = {
  app,
  catalog: () => ({ ids: ['counter'], hash: 'h' }),
  variants: () => new Map(),
  roles: () => ['public'],
  wire: () => async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' }),
  runtime: {} as ShellHostContext['runtime'],
  policy: () => policy,
};

describe('shells — the shell host', () => {
  it('one durable shell per principal (same principal → same shell)', () => {
    const host = createShellHost(ctx);
    const a = host.session('t', 'usr_1');
    const b = host.session('t', 'usr_1');
    expect(a.shell).toBe(b.shell);
  });

  it('a different principal is a different shell', () => {
    const host = createShellHost(ctx);
    expect(host.session('t', 'usr_1').shell).not.toBe(host.session('t', 'usr_2').shell);
  });

  it('anonymous sessions are ephemeral (a fresh shell each time)', () => {
    const host = createShellHost(ctx);
    expect(host.session(null, null).shell).not.toBe(host.session(null, null).shell);
  });

  it('dispatch(canvas, event) stamps the active instance as origin — the event is delivered', async () => {
    const host = createShellHost(ctx);
    const session = host.session('t', 'usr_1');
    await tick();
    const active = session.shell.getState().canvases['main']?.active;
    expect(active).toBeDefined();
    // A canvas-tagged click, no client-side origin — the host stamps it.
    session.dispatch('main', { type: 'ui:click', ref: 'bump' });
    await tick();
    expect(session.shell.getRuntime(active!.id)?.getData()['n']).toBe(1);
  });

  it('an ungranted initial does not mount (ring 1)', () => {
    const host = createShellHost({ ...ctx, catalog: () => ({ ids: [], hash: 'h' }) });
    const session = host.session('t', 'usr_1');
    expect(session.shell.getState().canvases['main']?.active).toBeUndefined();
  });

  it('a held variant replaces the definition layout; behavior is untouched (ring 2)', async () => {
    // The base renders "base"; the variant renders "variant". Same action id,
    // same triggers — the substitution happens on the definition at build.
    const withLayouts = {
      ...app,
      actions: { counter: { ...counter, layout: { component: 'Text', children: 'base' } } },
      layouts: { 'counter.basic': { action: 'counter', layout: { component: 'Text', children: 'variant' } } },
    } as unknown as NiscApp;
    const rendered = (principal: string, held: boolean): string => {
      const host = createShellHost({
        ...ctx,
        app: withLayouts,
        variants: () => (held ? new Map([['counter', { component: 'Text', children: 'variant' }]]) : new Map()),
      });
      return JSON.stringify(host.session('t', principal).shell.flattenRenderTree(host.session('t', principal).shell.getCanvasRenderTree('main')));
    };
    expect(rendered('usr_base', false)).toContain('base');
    expect(rendered('usr_base', false)).not.toContain('variant');
    expect(rendered('usr_held', true)).toContain('variant');
    expect(rendered('usr_held', true)).not.toContain('"base"');

    // Behavior survives the swap: the variant principal's click still bumps.
    const host = createShellHost({
      ...ctx,
      app: withLayouts,
      variants: () => new Map([['counter', { component: 'Text', children: 'variant' }]]),
    });
    const session = host.session('t', 'usr_bump');
    await tick();
    const active = session.shell.getState().canvases['main']?.active;
    session.dispatch('main', { type: 'ui:click', ref: 'bump' });
    await tick();
    expect(session.shell.getRuntime(active!.id)?.getData()['n']).toBe(1);
  });
});
