import { describe, it, expect, vi } from 'vitest';
import type { ActionDefinition } from '@niscorp/nova';
import type { ScopePolicy } from '@niscorp/vex';
import { createShellHost } from '../src/shells';
import type { ShellHostContext, ShellSnapshot } from '../src/shells';
import type { NiscApp, PageManifest } from '../src/app';
import type { MossServer } from '../src/server';
import { createPageRouter } from '../src/pages';
import { shellNeedOf } from '../src/liveness';
import { documentHeaders, embedSnapshot, exportDocuments, renderDocument, tokenFromCookie } from '../src/document';
import { readDocumentSnapshot } from '../src/client';

// ═══════════════════════════════════════════════════════════════
// The document: who is asking (a cookie), which shell (a page's, or the app's),
// drawn into the app's own index.html — and who may keep the result.
// ═══════════════════════════════════════════════════════════════

const words: ActionDefinition = { id: 'words', data: { title: 'Hello', slug: '' }, layout: { component: 'Text', children: '$.title' } };
const counter: ActionDefinition = { id: 'counter', data: { n: 0 }, layout: { component: 'Button', ref: 'bump', children: '$.n' }, triggers: [{ event: 'ui:click', ref: 'bump', do: [{ increment: 'n' }] }] };
const chip: ActionDefinition = { id: 'chip', data: { name: '' }, layout: { component: 'Text', children: '$.name' } };
// a screen with a head of its own, bound to what its path named
const post: ActionDefinition = {
  id: 'post',
  data: { slug: '', title: 'A post' },
  layout: {
    component: 'Stack',
    children: [
      {
        component: 'nova:head',
        children: [
          { component: 'nova:title', children: '{{$.title}}: {{$.slug}}' },
          { component: 'nova:meta', props: { name: 'description', content: 'About <{{$.slug}}>.' } },
          { component: 'nova:meta', props: { property: 'og:type', content: 'article' } },
        ],
      },
      { component: 'Text', children: '$.title' },
    ],
  },
};

const policy: ScopePolicy = { default: 'deny', entities: {} };
const docs: PageManifest = {
  path: '/docs/:slug',
  params: 'main',
  canvases: [{ id: 'main', initial: 'words' }, { id: 'who', initial: 'chip' }],
  inputs: ({ principal }): Record<string, Record<string, unknown>> => (principal === null ? {} : { who: { name: 'Max' } }),
};
const posts: PageManifest = { path: '/posts/:slug', params: 'main', canvases: [{ id: 'main', initial: 'post' }] };
const app = { charter: {}, assignments: {}, actions: { words, counter, chip, post }, shell: { canvases: [{ id: 'main', initial: 'counter' }] }, pages: { docs, posts } } as unknown as NiscApp;

// The parts of a server a document asks for, stood up the way createServer
// stands them up: one context, the app's host and each page's.
const serverOf = (): MossServer => {
  const context: ShellHostContext = {
    app,
    catalogFor: () => ({ ids: [], hash: 'h' }),
    variantsFor: () => new Map(),
    resolve: async (principal) => ({ roles: [principal === null ? 'public' : 'member'], scope: {}, installed: undefined, catalog: { ids: principal === null ? ['words', 'counter', 'post'] : ['words', 'counter', 'chip', 'post'], hash: 'h' }, variants: new Map(), policy }),
    wire: () => async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' }),
    runtime: {} as ShellHostContext['runtime'],
    needOf: (definition) => shellNeedOf(definition, new Map()),
  };
  const shells = createShellHost(context);
  const hosts = new Map([
    ['docs', createShellHost({ ...context, manifest: docs, kept: false })],
    ['posts', createShellHost({ ...context, manifest: posts, kept: false })],
  ]);
  const router = createPageRouter({ docs, posts });
  return {
    shells,
    principalOf: async (token: string) => (token === 'good' ? 'usr_max' : null),
    page: (path: string) => {
      const matched = router.match(path);
      return matched === undefined ? undefined : { name: matched.name, host: hosts.get(matched.name), inputs: { main: matched.params } };
    },
  } as unknown as MossServer;
};

const TEMPLATE = '<!doctype html><html lang="en"><head></head><body><div id="root"></div><script type="module" src="/main.js"></script></body></html>';
// a terminal that draws to a string: every text node, in order
const draw = (snapshot: ShellSnapshot): string => {
  const text = (nodes: unknown): string => (JSON.stringify(nodes).match(/"value":"([^"]*)"/g) ?? []).map((m) => m.slice(9, -1)).join(' ');
  return `<main>${text(Object.values(snapshot.trees))}</main>`;
};
const parsed = (html: string): ReturnType<typeof readDocumentSnapshot> => {
  const text = /<script type="application\/json" id="nisc-snapshot">([\s\S]*?)<\/script>/.exec(html)?.[1];
  return readDocumentSnapshot({ getElementById: () => ({ textContent: text ?? '' }) as HTMLElement });
};

describe('tokenFromCookie', () => {
  it('reads the wire’s token key, among whatever else the header carries', () => {
    expect(tokenFromCookie('theme=dark; nisc.token=st_abc%2B1; other=1')).toBe('st_abc+1');
    expect(tokenFromCookie('nisc.token.ada=one; nisc.token=two', 'nisc.token.ada')).toBe('one');
  });
  it('nothing, an empty value and a value that does not decode are all nobody', () => {
    expect(tokenFromCookie(null)).toBeNull();
    expect(tokenFromCookie('theme=dark')).toBeNull();
    expect(tokenFromCookie('nisc.token=')).toBeNull();
    expect(tokenFromCookie('nisc.token=%E0%A4%A')).toBeNull();
  });
});

describe('documentHeaders — who may keep a page follows from who asked', () => {
  it('a page for nobody may be kept, and is told apart on the cookie', () => {
    expect(documentHeaders(null)).toEqual({ 'cache-control': 'no-cache', vary: 'Cookie' });
  });
  it('a page for somebody may not', () => {
    expect(documentHeaders('usr_max')['cache-control']).toBe('private, no-store');
  });
});

describe('embedSnapshot', () => {
  const snapshot: ShellSnapshot = { frame: [{ type: 'text', value: '</script><script>alert(1)</script>\u2028' }], trees: {}, settled: true, live: false, why: [], drawnWith: [] };
  it('nothing in a tree can close the element it rides in', () => {
    const element = embedSnapshot(snapshot, null);
    expect(element.match(/<\/script>/g)).toHaveLength(1);
    expect(element).not.toContain('\u2028');
  });
  it('and the terminal reads back exactly what was written', () => {
    const read = parsed(embedSnapshot({ ...snapshot, seed: 'abcdef012345' }, 'usr_max', '/docs/intro'));
    expect(read).toEqual({ frame: snapshot.frame, trees: {}, principal: true, seed: 'abcdef012345', path: '/docs/intro', live: false });
  });
});

describe('renderDocument', () => {
  it('nobody asking, the app’s path: the app’s screen for nobody, kept by caches', async () => {
    const page = await renderDocument({ server: serverOf(), template: TEMPLATE, request: { path: '/' }, draw });
    expect(page.drawn).toBe(true);
    expect(page.principal).toBeNull();
    expect(page.html).toContain('<div id="root"><main>0</main></div><script type="application/json" id="nisc-snapshot">');
    expect(page.html).toContain('<script type="module" src="/main.js"></script>');
    expect(page.headers['cache-control']).toBe('no-cache');
    expect(page.live).toBe(true);
    expect(parsed(page.html)?.principal).toBe(false);
  });

  it('a path that leads to a page is drawn by that page, with the path’s parameters', async () => {
    const page = await renderDocument({ server: serverOf(), template: TEMPLATE, request: { path: '/docs/intro' }, draw: (snapshot) => JSON.stringify(snapshot.trees['main']).includes('Hello') ? 'docs' : 'not docs' });
    expect(page.page).toBe('docs');
    expect(page.html).toContain('<div id="root">docs</div>');
    expect(page.live).toBe(false);
    expect(parsed(page.html)).toMatchObject({ path: '/docs/intro', live: false, principal: false });
  });

  it('somebody asking for a page: it is drawn for them, is theirs alone — and still keeps no shell', async () => {
    const server = serverOf();
    const page = await renderDocument({ server, template: TEMPLATE, request: { path: '/docs/intro', cookie: 'nisc.token=good' }, draw });
    expect(page.principal).toBe('usr_max');
    expect(page.html).toContain('Max');
    expect(page.headers['cache-control']).toBe('private, no-store');
    expect(page.live).toBe(false);
    expect(server.shells?.list()).toEqual([]);
  });

  it('a dead cookie is nobody, and is taken back', async () => {
    const page = await renderDocument({ server: serverOf(), template: TEMPLATE, request: { path: '/docs/intro', cookie: 'nisc.token=stale' }, draw });
    expect(page.principal).toBeNull();
    expect(page.html).not.toContain('Max');
    expect(page.headers['set-cookie']).toContain('Max-Age=0');
    expect(page.headers['cache-control']).toBe('no-cache');
  });

  it('what the kit would have put on <html> is in the markup, escaped', async () => {
    const page = await renderDocument({ server: serverOf(), template: TEMPLATE, request: { path: '/' }, draw, htmlAttributes: () => ({ 'data-accent': 'sa"ge' }) });
    expect(page.html).toContain('<html lang="en" data-accent="sa&quot;ge">');
  });

  it('a screen with `$&` in it is written as it is, not read as a pattern', async () => {
    const page = await renderDocument({ server: serverOf(), template: TEMPLATE, request: { path: '/' }, draw: () => 'cost: $& and $1' });
    expect(page.html).toContain('<div id="root">cost: $& and $1</div>');
  });

  it('nothing can fail a page: a draw that throws is the template, undrawn', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const page = await renderDocument({ server: serverOf(), template: TEMPLATE, request: { path: '/' }, draw: () => { throw new Error('kit'); } });
    quiet.mockRestore();
    expect(page).toMatchObject({ drawn: false, html: TEMPLATE, principal: null });
  });

  it('a verifier that throws is a fault, not a sign-out: undrawn, and the cookie stays', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const server = { ...serverOf(), principalOf: async () => { throw new Error('database blip'); } } as unknown as MossServer;
    const page = await renderDocument({ server, template: TEMPLATE, request: { path: '/', cookie: 'nisc.token=good' }, draw });
    quiet.mockRestore();
    expect(page.drawn).toBe(false);
    expect(page.headers['set-cookie']).toBeUndefined();
  });

  it('a template with no empty root is left alone', async () => {
    const page = await renderDocument({ server: serverOf(), template: '<html><body></body></html>', request: { path: '/' }, draw });
    expect(page.drawn).toBe(false);
  });
});

describe('renderDocument — the head a screen has', () => {
  const HEADED = TEMPLATE.replace('<head></head>', '<head><title>The site</title><link rel="canonical" href="https://example.com/"></head>');

  it('the elements the screen’s head holds are written into the template’s head, escaped', async () => {
    const page = await renderDocument({ server: serverOf(), template: HEADED, request: { path: '/posts/intro' }, draw });
    expect(page.head).toEqual({
      elements: [
        { tag: 'title', attributes: {}, text: 'A post: intro' },
        { tag: 'meta', attributes: { name: 'description', content: 'About <intro>.' } },
        { tag: 'meta', attributes: { property: 'og:type', content: 'article' } },
      ],
      actions: ['post'],
      refused: [],
    });
    const head = page.html.slice(0, page.html.indexOf('</head>'));
    // the title takes the template's place, which is kept for the page to give back
    expect(head).toContain('<title data-nova-head>A post: intro</title>');
    expect(head).toContain('<template data-nova-own><title>The site</title></template>');
    expect(head).toContain('<meta name="description" content="About &lt;intro>." data-nova-head>');
    expect(head).toContain('<meta property="og:type" content="article" data-nova-head>');
    // nobody said where the document lives: the template's stays
    expect(head).toContain('<link rel="canonical" href="https://example.com/">');
    // the screen is where it always was, and the terminal starts from the same trees
    // (this test's drawer prints every text in the trees, the title's included — a kit draws nothing for a head)
    expect(page.html).toContain('A post</main></div><script type="application/json" id="nisc-snapshot">');
    expect(JSON.stringify(parsed(page.html)?.trees)).toContain('nova:head');
  });

  it('with a site, each path says its own address — a screen with a head and one without', async () => {
    const site = 'https://example.com';
    const [post, home] = await Promise.all([
      renderDocument({ server: serverOf(), template: HEADED, request: { path: '/posts/intro' }, draw, site }),
      renderDocument({ server: serverOf(), template: HEADED, request: { path: '/' }, draw, site }),
    ]);
    expect(post.html).toContain('<link rel="canonical" href="https://example.com/posts/intro">');
    expect(post.html).toContain('<meta property="og:url" content="https://example.com/posts/intro">');
    // no head on the app's screen: the template's title, at its own address
    expect(home.head).toBeUndefined();
    expect(home.html).toContain('<title>The site</title>');
    expect(home.html).toContain('<link rel="canonical" href="https://example.com/">');
  });

  it('a screen with no head, and no site: the document is what it was before there were heads', async () => {
    const page = await renderDocument({ server: serverOf(), template: HEADED, request: { path: '/' }, draw });
    expect(page.html.slice(0, page.html.indexOf('</head>'))).toBe(HEADED.slice(0, HEADED.indexOf('</head>')));
  });

  it('a file written for a path carries the head it was written with', async () => {
    const [file] = await exportDocuments({ server: serverOf(), template: HEADED, draw, paths: ['/posts/intro'] });
    expect(file?.head?.actions).toEqual(['post']);
    expect(file?.html).toContain('<title data-nova-head>A post: intro</title>');
  });
});

describe('exportDocuments — pages, as files', () => {
  it('draws each path for nobody, and says which ones can still do something', async () => {
    const files = await exportDocuments({ server: serverOf(), template: TEMPLATE, draw, paths: ['/docs/intro', '/'] });
    expect(files.map((file) => [file.path, file.page, file.live])).toEqual([
      ['/docs/intro', 'docs', false],
      ['/', undefined, true],
    ]);
    expect(files[1]?.why).toEqual(['counter: a person can act on it']);
    for (const file of files) {
      expect(parsed(file.html)?.principal).toBe(false);
      expect(file.html).not.toContain('Max');
    }
  });
});
