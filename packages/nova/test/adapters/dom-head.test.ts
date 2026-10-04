// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { HEAD_META_NAME, HEAD_NAME, HEAD_TITLE_NAME } from '@layout';
import { createShell, headOf, shellSettled, shellView, CANVAS_SLOT_NAME, ACTION_SLOT_NAME } from '@shell';
import type { Shell } from '@shell';
import { mountShell } from '../../src/adapters/dom';
import type { DomComponent } from '../../src/adapters/dom';
import { renderToString } from '../../src/adapters/dom/server';
import { defaultRegistry, fallback } from '../../src/adapters/dom/components';
import { createHeadKeeper, placeHead } from '../../src/document';

// ═══════════════════════════════════════════════════════════
// A head under the DOM adapter: nothing is drawn for it or for what it holds,
// and the page's <head> is kept on it for as long as the shell lives in the
// page.
// ═══════════════════════════════════════════════════════════

const tick = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms));

const article: ActionDefinition = {
  id: 'article',
  data: { title: 'First title' },
  layout: {
    component: 'Cells',
    children: [
      {
        component: HEAD_NAME,
        children: [
          { component: HEAD_TITLE_NAME, children: '$.title' },
          { component: HEAD_META_NAME, props: { name: 'description', content: 'About {{$.title}}.' } },
          { component: HEAD_META_NAME, props: { property: 'og:image:alt', content: '$.title' } },
        ],
      },
      { component: 'Text', children: '$.title' },
      { component: 'Button', ref: 'rename', props: { label: 'rename' } },
      { component: 'Button', ref: 'leave', props: { label: 'leave' } },
    ],
  },
  triggers: [
    { event: 'ui:click', ref: 'rename', do: [{ set: 'title', value: 'Second title' }] },
    { event: 'ui:click', ref: 'leave', do: [{ replace: { canvas: 'main', action: 'plain' } }] },
  ],
};

const plain: ActionDefinition = { id: 'plain', data: {}, layout: { component: 'Text', children: 'no head here' } };

// A kit whose container gives every child a cell: what a head must never be handed to.
const cells: DomComponent = ({ children }) => {
  const el = document.createElement('div');
  for (const child of children) {
    const cell = document.createElement('span');
    cell.className = 'cell';
    cell.appendChild(child);
    el.appendChild(cell);
  }
  return el;
};

const kit = (): ReturnType<typeof defaultRegistry> => {
  const registry = defaultRegistry();
  registry.register(CANVAS_SLOT_NAME, fallback);
  registry.register(ACTION_SLOT_NAME, fallback);
  registry.register('Cells', cells);
  return registry;
};

const boot = (): Shell => {
  let minted = 0;
  return createShell({ registry: kit(), canvases: [{ id: 'main', initial: 'article' }], actions: { article, plain }, instanceIdFn: () => `act-${(minted += 1)}` });
};

const press = (root: HTMLElement, ref: string): void => root.querySelector<HTMLElement>(`[data-ref="${ref}"]`)?.click();

// the page's own head, as index.html wrote it
const OWN = '<meta charset="UTF-8"><title>The site</title><meta name="description" content="Everything about the site."><link rel="icon" href="/i.svg">';
const descriptions = (): (string | null)[] => [...document.head.querySelectorAll('meta[name="description"]')].map((node) => node.getAttribute('content'));

beforeEach(() => {
  document.head.innerHTML = OWN;
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('a head, under the DOM adapter', () => {
  it('draws nothing — for it or for what it holds — and is not handed to the component it is a child of', async () => {
    const shell = boot();
    await shellSettled(shell);
    const html = renderToString(kit(), shellView(shell).api, { window, fallback });
    expect(html).not.toContain('nova:');
    expect(html).not.toContain('About First title');
    // three children drawn, three cells — none for the head
    expect(html.match(/class="cell"/g)).toHaveLength(3);
  });

  it('drawing to a string leaves the page’s head alone', async () => {
    const shell = boot();
    await shellSettled(shell);
    renderToString(kit(), shellView(shell).api, { window, fallback });
    expect(document.head.innerHTML).toBe(OWN);
  });

  it('the page picks the drawn markup up as the same elements', async () => {
    const built = boot();
    await shellSettled(built);
    const html = renderToString(kit(), shellView(built).api, { window, fallback });
    const root = document.createElement('div');
    root.innerHTML = html;
    document.body.appendChild(root);
    const shell = boot();
    await shellSettled(shell);
    mountShell(root, kit(), shell, { fallback });
    expect(root.innerHTML).toBe(html);
  });

  it('the page’s head follows the screen: its elements go in, the document’s own give way — and come back', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const shell = boot();
    await shellSettled(shell);
    const mounted = mountShell(root, kit(), shell, { fallback });
    expect(document.title).toBe('First title');
    expect(descriptions()).toEqual(['About First title.']);
    expect(document.head.querySelector('meta[property="og:image:alt"]')?.getAttribute('content')).toBe('First title');
    // what the screen did not speak of is where it was
    expect(document.head.querySelector('link[rel="icon"]')?.getAttribute('href')).toBe('/i.svg');

    press(root, 'rename');
    await tick(5);
    expect(document.title).toBe('Second title');
    expect(descriptions()).toEqual(['About Second title.']);

    // a screen with no head: the document says what it always did, in the order it did
    press(root, 'leave');
    await tick(5);
    expect(root.textContent).toContain('no head here');
    expect(document.head.innerHTML).toBe(OWN);
    mounted.destroy();
  });

  it('a shell with no head never touches the page’s', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    // another shell's elements are in the head; this one has nothing to say about them
    document.head.innerHTML = '<title data-nova-head>Named by another</title><template data-nova-own><title>The site</title></template>';
    const written = document.head.innerHTML;
    const shell = createShell({ registry: kit(), canvases: [{ id: 'main', initial: 'plain' }], actions: { plain } });
    await shellSettled(shell);
    const mounted = mountShell(root, kit(), shell, { fallback });
    shell.push('main', 'plain');
    await tick(5);
    expect(document.head.innerHTML).toBe(written);
    mounted.destroy();
  });
});

describe('createHeadKeeper — a page that arrived drawn', () => {
  it('takes over what the file was written with, and gives the document’s own back when the screen stops saying it', async () => {
    const shell = boot();
    await shellSettled(shell);
    const said = headOf(shellView(shell).api)?.elements ?? [];
    // the head of the file `nisc export` writes for this screen
    const file = placeHead(`<html><head>${OWN}</head><body></body></html>`, said, { site: 'https://example.com', path: '/articles/first/' });
    document.head.innerHTML = file.slice(file.indexOf('<head>') + 6, file.indexOf('</head>'));
    expect(document.title).toBe('First title');

    const keep = createHeadKeeper(document);
    keep(said);
    // the same head, said once
    expect(document.title).toBe('First title');
    expect(descriptions()).toEqual(['About First title.']);
    expect(document.head.querySelector('template')).toBeNull();

    keep([{ tag: 'title', attributes: {}, text: 'Another screen' }]);
    expect(document.title).toBe('Another screen');
    // the description is the document's own again; the address it was written at stays
    expect(descriptions()).toEqual(['Everything about the site.']);
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://example.com/articles/first/');

    keep(undefined);
    expect(document.title).toBe('The site');
    expect(document.head.querySelectorAll('[data-nova-head]')).toHaveLength(0);
  });
});
