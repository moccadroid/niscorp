import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createComponentRegistry, HEAD_LINK_NAME, HEAD_META_NAME, HEAD_NAME, HEAD_SCRIPT_NAME, HEAD_TITLE_NAME } from '@layout';
import type { LayoutNode, RenderNode } from '@layout';
import { createShell, headOf, shellSettled, shellView } from '@shell';
import type { Shell } from '@shell';

// The head a screen has: `nova:head` in a layout, holding the elements a
// document's <head> holds, read off the render tree.

// A registry that holds the app's own names and NOT the head's: nothing draws
// a head or what it holds, so nothing has to be registered for them.
const names = (): ReturnType<typeof createComponentRegistry> => {
  const registry = createComponentRegistry();
  for (const name of ['CanvasSlot', 'ActionSlot', 'Stack', 'Text']) registry.register(name, {});
  return registry;
};

const head = (children: LayoutNode[]): LayoutNode => ({ component: HEAD_NAME, children });
const title = (text: string): LayoutNode => ({ component: HEAD_TITLE_NAME, children: text });
const meta = (props: Record<string, unknown>): LayoutNode => ({ component: HEAD_META_NAME, props });
const link = (props: Record<string, unknown>): LayoutNode => ({ component: HEAD_LINK_NAME, props });
const script = (props: Record<string, unknown>): LayoutNode => ({ component: HEAD_SCRIPT_NAME, props });

const article: ActionDefinition = {
  id: 'article',
  data: { page: { title: 'Types & <tags>', lead: 'What a type can and cannot promise.', german: '/de/typen/' }, about: { '@type': 'Article' } },
  layout: {
    component: 'Stack',
    children: [
      head([
        title('{{$.page.title}} · the site'),
        meta({ name: 'description', content: '$.page.lead' }),
        // nova keeps no list of these: any name, any property, any rel
        meta({ property: 'og:image:alt', content: '$.page.title' }),
        meta({ name: 'made-up-tomorrow', content: 'yes' }),
        link({ rel: 'alternate', hreflang: 'de', href: '$.page.german' }),
        script({ type: 'application/ld+json', data: '$.about' }),
      ]),
      { component: 'Text', children: '$.page.title' },
    ],
  },
};

const contact: ActionDefinition = {
  id: 'contact',
  data: {},
  layout: { component: 'Stack', children: [head([title('Contact'), meta({ name: 'robots', content: 'noindex' })]), { component: 'Text', children: 'Write to us' }] },
};

const plain: ActionDefinition = { id: 'plain', data: {}, layout: { component: 'Text', children: 'no head here' } };

const frame = (children: LayoutNode[]): LayoutNode => ({ component: 'Stack', children });
const slot = (canvasId: string): LayoutNode => ({ component: 'CanvasSlot', props: { canvasId } });

const shellOf = (extra: Partial<Parameters<typeof createShell>[0]> = {}): Shell =>
  createShell({
    registry: names(),
    canvases: [{ id: 'main', initial: 'article' }, { id: 'over' }],
    canvasLayout: frame([slot('main'), slot('over')]),
    actions: { article, contact, plain },
    strict: true,
    ...extra,
  });

const one = (layout: LayoutNode[], data: Record<string, unknown> = {}): Promise<ReturnType<typeof headOf>> => {
  const only: ActionDefinition = { id: 'only', data, layout: { component: 'Stack', children: [head(layout), { component: 'Text', children: 'seen' }] } };
  const shell = shellOf({ canvases: [{ id: 'main', initial: 'only' }, { id: 'over' }], actions: { only } });
  return shellSettled(shell).then(() => headOf(shellView(shell).api));
};

describe('headOf — the head a screen has', () => {
  it('is the elements its head holds: each one’s props its attributes, bound and written as given', async () => {
    const shell = shellOf();
    await shellSettled(shell);
    expect(headOf(shellView(shell).api)).toEqual({
      elements: [
        { tag: 'title', attributes: {}, text: 'Types & <tags> · the site' },
        { tag: 'meta', attributes: { name: 'description', content: 'What a type can and cannot promise.' } },
        { tag: 'meta', attributes: { property: 'og:image:alt', content: 'Types & <tags>' } },
        { tag: 'meta', attributes: { name: 'made-up-tomorrow', content: 'yes' } },
        { tag: 'link', attributes: { rel: 'alternate', hreflang: 'de', href: '/de/typen/' } },
        { tag: 'script', attributes: { type: 'application/ld+json' }, text: '{"@type":"Article"}' },
      ],
      actions: ['article'],
      refused: [],
    });
  });

  it('a screen with no head node has none', async () => {
    const shell = shellOf({ canvases: [{ id: 'main', initial: 'plain' }, { id: 'over' }] });
    await shellSettled(shell);
    expect(headOf(shellView(shell).api)).toBeUndefined();
  });

  it('with more than one head on the screen, an element that says the same thing takes the earlier one’s place — and the rest stand', async () => {
    const shell = shellOf();
    shell.push('over', 'contact');
    await shellSettled(shell);
    const found = headOf(shellView(shell).api);
    // the dialog's title, the page's description still beside it, and the dialog's robots
    expect(found?.elements.filter((element) => element.tag === 'title')).toEqual([{ tag: 'title', attributes: {}, text: 'Contact' }]);
    expect(found?.elements).toContainEqual({ tag: 'meta', attributes: { name: 'description', content: 'What a type can and cannot promise.' } });
    expect(found?.elements).toContainEqual({ tag: 'meta', attributes: { name: 'robots', content: 'noindex' } });
    expect(found?.actions).toEqual(['article', 'contact']);
    shell.pop('over');
    expect(headOf(shellView(shell).api)?.elements[0]?.text).toBe('Types & <tags> · the site');
  });

  it('a head in the frame holds on every screen, until an action says the same thing itself', async () => {
    const withSite = (initial: string): Shell =>
      shellOf({
        canvases: [{ id: 'main', initial }, { id: 'over' }],
        canvasLayout: frame([head([title('The site'), meta({ property: 'og:site_name', content: 'The site' })]), slot('main'), slot('over')]),
      });
    const [home, page] = [withSite('plain'), withSite('article')];
    await Promise.all([shellSettled(home), shellSettled(page)]);
    // only the shell's chrome said anything: no action is named
    expect(headOf(shellView(home).api)).toEqual({
      elements: [{ tag: 'title', attributes: {}, text: 'The site' }, { tag: 'meta', attributes: { property: 'og:site_name', content: 'The site' } }],
      actions: [],
      refused: [],
    });
    const said = headOf(shellView(page).api)?.elements ?? [];
    expect(said.filter((element) => element.tag === 'title').map((element) => element.text)).toEqual(['Types & <tags> · the site']);
    expect(said).toContainEqual({ tag: 'meta', attributes: { property: 'og:site_name', content: 'The site' } });
  });

  it('two that do not say the same thing stand side by side: alternates, data blocks, metas with no name', async () => {
    const found = await one([
      link({ rel: 'alternate', hreflang: 'de', href: '/de/' }),
      link({ rel: 'alternate', hreflang: 'fr', href: '/fr/' }),
      script({ type: 'application/ld+json', data: { '@type': 'Person' } }),
      script({ type: 'application/json', id: 'state', data: [1, 2] }),
      link({ rel: 'canonical', href: 'https://example.com/a' }),
      link({ rel: 'canonical', href: 'https://example.com/b' }),
    ]);
    expect(found?.elements.map((element) => element.attributes['href'] ?? element.attributes['type'])).toEqual(['/de/', '/fr/', 'application/ld+json', 'application/json', 'https://example.com/b']);
    expect(found?.elements[3]).toEqual({ tag: 'script', attributes: { type: 'application/json', id: 'state' }, text: '[1,2]' });
  });

  it('an element whose value is not answered yet is left out, and an attribute that says nothing is not written', async () => {
    const found = await one(
      [
        title('{{$.page.title}}'),
        meta({ name: 'description', content: '$.page.lead' }),
        meta({ name: 'robots', content: 'noindex', media: '$.missing', lang: '' }),
        link({ rel: 'alternate', href: '$.page.feed' }),
        script({ type: 'application/ld+json', data: '$.page.about' }),
        link({ rel: 'preconnect', href: 'https://cdn.example.net', crossorigin: true, hidden: false }),
        meta({ name: 'count', content: 3 }),
      ],
      { page: { title: '', lead: '' } },
    );
    // still a head — it says less for now
    expect(found).toEqual({
      elements: [
        { tag: 'meta', attributes: { name: 'robots', content: 'noindex' } },
        { tag: 'link', attributes: { rel: 'preconnect', href: 'https://cdn.example.net', crossorigin: '' } },
        { tag: 'meta', attributes: { name: 'count', content: '3' } },
      ],
      actions: ['only'],
      refused: [],
    });
  });

  it('refuses what runs or styles — left out, each with why', async () => {
    const found = await one([
      script({ type: 'text/javascript', data: 'alert(1)' }),
      script({ type: 'module', data: {} }),
      script({ type: 'application/ld+json', src: 'https://elsewhere.example/x.js', data: {} }),
      meta({ 'http-equiv': 'refresh', content: '0;url=https://elsewhere.example' }),
      link({ rel: 'stylesheet', href: '/look.css' }),
      link({ rel: 'icon', href: '/i.svg', onload: 'alert(1)' }),
      meta({ 'not an attribute': 'x', content: 'y' }),
      { component: 'Text', children: 'not a head element' },
      meta({ name: 'kept', content: 'yes' }),
    ]);
    expect(found?.elements).toEqual([{ tag: 'meta', attributes: { name: 'kept', content: 'yes' } }]);
    expect(found?.refused).toEqual([
      'nova:script: only a data block may be written (a JSON `type`), and "text/javascript" is not one',
      'nova:script: only a data block may be written (a JSON `type`), and "module" is not one',
      'nova:script: a script with a `src` runs, and a layout does not',
      'nova:meta: `http-equiv` instructs the browser, and a layout does not',
      'nova:link: a stylesheet styles the page, and a layout does not',
      'nova:link: `onload` is a handler, and a layout does not run',
      'nova:meta: "not an attribute" is not an attribute’s name',
      'nova:head: "Text" is not something a head holds',
    ]);
  });

  it('is not something to see: a canvas holding only a head is an empty canvas', async () => {
    const only: ActionDefinition = { id: 'only', data: {}, layout: head([title('Unseen')]) };
    const shell = shellOf({ canvases: [{ id: 'main', initial: 'only' }, { id: 'over' }], actions: { only } });
    await shellSettled(shell);
    expect(shellView(shell).api.canvasTree('main')).toEqual([]);
    expect(headOf(shellView(shell).api)).toBeUndefined();
  });

  it('loops and conditions work in a head as they do anywhere in a layout', async () => {
    const found = await one(
      [
        { for: '$.languages', as: 'language', do: link({ rel: 'alternate', hreflang: '$language.code', href: '$language.href' }) },
        { if: '$.hidden', then: meta({ name: 'robots', content: 'noindex' }) },
      ],
      { languages: [{ code: 'de', href: '/de/' }, { code: 'fr', href: '/fr/' }], hidden: true },
    );
    expect(found?.elements).toEqual([
      { tag: 'link', attributes: { rel: 'alternate', hreflang: 'de', href: '/de/' } },
      { tag: 'link', attributes: { rel: 'alternate', hreflang: 'fr', href: '/fr/' } },
      { tag: 'meta', attributes: { name: 'robots', content: 'noindex' } },
    ]);
  });

  it('reads a served screen the same way: a frame and a tree per canvas', async () => {
    const shell = shellOf();
    await shellSettled(shell);
    const { api } = shellView(shell);
    const frameAsServed = api.frame();
    const trees: Record<string, RenderNode[]> = { main: api.canvasTree('main'), over: api.canvasTree('over') };
    expect(headOf({ frame: () => frameAsServed, canvasTree: (id) => trees[id] ?? [] })).toEqual(headOf(api));
  });
});
