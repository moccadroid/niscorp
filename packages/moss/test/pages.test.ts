import { describe, it, expect } from 'vitest';
import type { ActionDefinition } from '@niscorp/nova';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { createPageRouter } from '../src/pages';
import { shellNeedOf } from '../src/liveness';
import type { PageManifest } from '../src/app';

const page = (path: string, extra: Partial<PageManifest> = {}): PageManifest => ({ path, canvases: [{ id: 'main' }], ...extra });

describe('createPageRouter — which page a path leads to', () => {
  const router = createPageRouter({ welcome: page('/welcome'), doc: page('/docs/:slug', { params: 'main' }), docs: page('/docs') });

  it('a literal path is itself', () => {
    expect(router.match('/welcome')).toEqual({ name: 'welcome', params: {} });
  });

  it('a parameter takes the segment, decoded', () => {
    expect(router.match('/docs/getting%20started')).toEqual({ name: 'doc', params: { slug: 'getting started' } });
  });

  it('length decides between a list and one of its pages', () => {
    expect(router.match('/docs')?.name).toBe('docs');
    expect(router.match('/docs/intro')?.name).toBe('doc');
  });

  it('a trailing slash and a query do not change the answer', () => {
    expect(router.match('/docs/')?.name).toBe('docs');
    expect(router.match('/docs/intro?ref=mail')).toEqual({ name: 'doc', params: { slug: 'intro' } });
  });

  it('anything else is not a page — it is the app’s', () => {
    expect(router.match('/')).toBeUndefined();
    expect(router.match('/docs/a/b')).toBeUndefined();
    expect(router.match('/elsewhere')).toBeUndefined();
  });

  it('a segment that does not decode matches nothing', () => {
    expect(router.match('/docs/%E0%A4%A')).toBeUndefined();
  });

  it('two pages that could answer one path are refused, whatever order they were written in', () => {
    expect(() => createPageRouter({ a: page('/docs/:slug'), b: page('/docs/:id') })).toThrow(/can both answer one path/);
    expect(() => createPageRouter({ a: page('/docs/new'), b: page('/docs/:id') })).toThrow(/can both answer one path/);
    expect(() => createPageRouter({ a: page('/docs/:slug'), b: page('/blog/:slug') })).not.toThrow();
  });

  it('a page whose parameters go to a canvas it does not have is refused', () => {
    expect(() => createPageRouter({ a: page('/docs/:slug', { params: 'body' }) })).toThrow(/does not have/);
  });

  it('a path that does not start at the root is refused', () => {
    expect(() => createPageRouter({ a: page('docs') })).toThrow(/starts with/);
  });
});

describe('shellNeedOf — does this action need a shell once drawn', () => {
  const read: SeedEntry = { fingerprint: 'docs/page', dsl: { from: ['docs'], fields: ['docs.title'] } };
  const board: SeedEntry = { ...read, fingerprint: 'board/open', refresh: 'reactive' };
  const save: SeedMutation = { fingerprint: 'docs/save', mutation: { update: 'docs', set: {}, where: {} } } as unknown as SeedMutation;
  const entries = new Map<string, SeedEntry | SeedMutation>([read, board, save].map((entry) => [entry.fingerprint, entry]));
  const vex = (fingerprint: string): { url: string; method: 'POST'; request: { fingerprint: string } } => ({ url: '/api/docs/vex', method: 'POST', request: { fingerprint } });

  it('authored data: nothing', () => {
    expect(shellNeedOf({ id: 'slide', data: { title: 'x' }, layout: { component: 'Text', children: '$.title' } }, entries)).toEqual({ live: false, why: [], drawnWith: [] });
  });

  it('a read made on open is finished — and named, because its answer is in the tree', () => {
    const doc: ActionDefinition = { id: 'doc', endpoints: { load: vex('docs/page') }, lifecycle: { mount: [{ call: 'load' }] } };
    expect(shellNeedOf(doc, entries)).toEqual({ live: false, why: [], drawnWith: ['docs/page'] });
  });

  it('a reactive read keeps answering', () => {
    const live: ActionDefinition = { id: 'board', endpoints: { load: vex('board/open') }, lifecycle: { mount: [{ call: 'load' }] } };
    const need = shellNeedOf(live, entries);
    expect(need.live).toBe(true);
    expect(need.why[0]).toContain('keeps answering');
  });

  it('a function endpoint is code, and is not read', () => {
    const asks: ActionDefinition = { id: 'ask', endpoints: { ask: { fn: 'assistant.ask' } }, lifecycle: { mount: [{ call: 'ask' }] } };
    expect(shellNeedOf(asks, entries).why).toEqual(['it calls the function endpoint "ask", which is code']);
  });

  it('a fingerprint the manifest does not carry is not concluded finished', () => {
    const elsewhere: ActionDefinition = { id: 'x', endpoints: { load: vex('seeded/elsewhere') }, lifecycle: { mount: [{ call: 'load' }] } };
    expect(shellNeedOf(elsewhere, entries).live).toBe(true);
  });

  it('a gesture, a channel: live, one line each', () => {
    const form: ActionDefinition = {
      id: 'form',
      endpoints: { save: vex('docs/save') },
      triggers: [
        { event: 'ui:click', ref: 'save', do: [{ call: 'save' }] },
        { message: 'docs-changed', do: [{ reload: true }] },
      ],
    };
    expect(shellNeedOf(form, entries).why).toEqual(['a person can act on it', 'it waits on the channel "docs-changed"']);
  });

  it('an endpoint nothing calls is not a reason', () => {
    expect(shellNeedOf({ id: 'idle', endpoints: { ask: { fn: 'never' } } }, entries).live).toBe(false);
  });
});
