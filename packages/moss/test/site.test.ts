import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { afterAll, describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@niscorp/nova';
import type { ScopePolicy } from '@niscorp/vex';
import { createShellHost } from '../src/shells';
import type { ShellHostContext, ShellSnapshot } from '../src/shells';
import type { NiscApp, PageManifest } from '../src/app';
import type { MossServer } from '../src/server';
import { createPageRouter } from '../src/pages';
import { shellNeedOf } from '../src/liveness';
import { mountSite } from '../src/node';

// ═══════════════════════════════════════════════════════════════
// The built terminal, served by the app's own process (`mountSite`): what is a
// file, what is a page, what is the app — and what is none of them.
// ═══════════════════════════════════════════════════════════════

const words: ActionDefinition = { id: 'words', data: { title: 'Hello', slug: '' }, layout: { component: 'Text', children: '$.title' } };
const counter: ActionDefinition = { id: 'counter', data: { n: 0 }, layout: { component: 'Text', children: '$.n' } };
const policy: ScopePolicy = { default: 'deny', entities: {} };
const docs: PageManifest = { path: '/docs/:slug', params: 'main', canvases: [{ id: 'main', initial: 'words' }] };
const app = { charter: {}, assignments: {}, actions: { words, counter }, shell: { canvases: [{ id: 'main', initial: 'counter' }] }, pages: { docs } } as unknown as NiscApp;

// A hono app carrying the parts of a moss server a site asks for, stood up the
// way createServer stands them up (see document.test.ts).
const serverOf = (): MossServer => {
  const context: ShellHostContext = {
    app,
    catalogFor: () => ({ ids: [], hash: 'h' }),
    variantsFor: () => new Map(),
    resolve: async () => ({ roles: ['public'], scope: {}, installed: undefined, catalog: { ids: ['words', 'counter'], hash: 'h' }, variants: new Map(), policy }),
    wire: () => async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' }),
    runtime: {} as ShellHostContext['runtime'],
    needOf: (definition) => shellNeedOf(definition, new Map()),
  };
  const shells = createShellHost(context);
  const pageHost = createShellHost({ ...context, manifest: docs, kept: false });
  const router = createPageRouter({ docs });
  return Object.assign(new Hono(), {
    shells,
    principalOf: async () => null,
    page: (path: string) => {
      const matched = router.match(path);
      return matched === undefined ? undefined : { name: matched.name, host: pageHost, inputs: { main: matched.params } };
    },
  }) as unknown as MossServer;
};

const draw = (snapshot: ShellSnapshot): string => `<main>${Object.keys(snapshot.trees).join(',')}</main>`;

const dist = mkdtempSync(join(tmpdir(), 'moss-site-'));
mkdirSync(join(dist, 'assets'));
writeFileSync(join(dist, 'index.html'), '<!doctype html><html lang="en"><head></head><body><div id="root"></div></body></html>');
writeFileSync(join(dist, 'assets', 'index-AbC12345.js'), 'export const built = true;\n');
writeFileSync(join(dist, 'robots.txt'), 'User-agent: *\n');
afterAll(() => rmSync(dist, { recursive: true, force: true }));

const site = (): MossServer => {
  const server = serverOf();
  mountSite(server, { dist, draw });
  return server;
};

describe('mountSite', () => {
  it('a built file is answered with the file', async () => {
    const server = site();
    const script = await server.request('/assets/index-AbC12345.js');
    expect(script.status).toBe(200);
    expect(script.headers.get('content-type')).toContain('javascript');
    expect(await script.text()).toBe('export const built = true;\n');
    expect(await (await server.request('/robots.txt')).text()).toBe('User-agent: *\n');
  });

  it('the app’s paths, and index.html itself, are answered with the page drawn', async () => {
    const server = site();
    for (const path of ['/', '/index.html', '/somewhere/in/the/app']) {
      const page = await server.request(path);
      expect(page.status).toBe(200);
      expect(page.headers.get('content-type')).toContain('text/html');
      expect(await page.text()).toContain('<div id="root"><main>main</main></div>');
    }
  });

  it('a name with an extension that is not a file is a missing file: 404, never a screen', async () => {
    const server = site();
    for (const path of ['/assets/index-GONE0000.js', '/favicon.ico', '/assets/kit.css', '/deep/er/photo.png']) {
      const missing = await server.request(path);
      expect(missing.status).toBe(404);
      expect(missing.headers.get('content-type') ?? '').not.toContain('text/html');
    }
  });

  it('…unless a page is at that path: a page’s parameter may have a dot in it', async () => {
    const server = site();
    const page = await server.request('/docs/v1.2');
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<div id="root"><main>main</main></div>');
  });

  it('an unknown path under the app server’s own is a 404, as before', async () => {
    const server = site();
    expect((await server.request('/api/nope')).status).toBe(404);
  });
});
