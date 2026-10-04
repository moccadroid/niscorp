// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { HEAD_NAME } from '@layout';
import { createShell, shellSettled, shellView, CANVAS_SLOT_NAME, ACTION_SLOT_NAME } from '@shell';
import type { Shell } from '@shell';
import { mountShell } from '../../src/adapters/dom';
import type { DomComponent } from '../../src/adapters/dom';
import { renderToString } from '../../src/adapters/dom/server';
import { defaultRegistry, fallback } from '../../src/adapters/dom/components';
import { createTitleKeeper } from '../../src/document';

// ═══════════════════════════════════════════════════════════
// A head node under the DOM adapter: nothing is drawn for it, and the tab's
// title follows it for as long as the shell lives in the page.
// ═══════════════════════════════════════════════════════════

const tick = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms));

const article: ActionDefinition = {
  id: 'article',
  data: { title: 'First title' },
  layout: {
    component: 'Cells',
    children: [
      { component: HEAD_NAME, props: { title: '$.title' } },
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

// A kit whose Stack gives every child a cell: what a head must never be handed to.
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

beforeEach(() => {
  document.title = 'The site';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('a head node, under the DOM adapter', () => {
  it('draws nothing, and is not handed to the component it is a child of', async () => {
    const shell = boot();
    await shellSettled(shell);
    const html = renderToString(kit(), shellView(shell).api, { window, fallback });
    expect(html).not.toContain(HEAD_NAME);
    // three children drawn, three cells — none for the head
    expect(html.match(/class="cell"/g)).toHaveLength(3);
  });

  it('drawing to a string names no tab', async () => {
    const shell = boot();
    await shellSettled(shell);
    renderToString(kit(), shellView(shell).api, { window, fallback });
    expect(document.title).toBe('The site');
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

  it('the tab’s title follows the head: when it changes, and when the screen has none', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const shell = boot();
    await shellSettled(shell);
    const mounted = mountShell(root, kit(), shell, { fallback });
    expect(document.title).toBe('First title');

    press(root, 'rename');
    await tick(5);
    expect(document.title).toBe('Second title');

    // a screen with no head has the document's own title again
    press(root, 'leave');
    await tick(5);
    expect(root.textContent).toContain('no head here');
    expect(document.title).toBe('The site');
    mounted.destroy();
  });

  it('a shell with no head never writes the title', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const shell = createShell({ registry: kit(), canvases: [{ id: 'main', initial: 'plain' }], actions: { plain } });
    await shellSettled(shell);
    const mounted = mountShell(root, kit(), shell, { fallback });
    // somebody else on the page names the tab; this shell has nothing to say about it
    document.title = 'Named by another';
    shell.push('main', 'plain');
    await tick(5);
    expect(document.title).toBe('Named by another');
    mounted.destroy();
  });
});

describe('createTitleKeeper — the tab’s title, kept on the screen’s head', () => {
  it('a drawn page says its own title beside the screen’s, and goes back to it', () => {
    document.head.innerHTML = '<title data-own="The site">Drawn title</title>';
    const keep = createTitleKeeper(document);
    keep({ title: 'Drawn title' });
    expect(document.title).toBe('Drawn title');
    keep({ title: 'Another screen' });
    expect(document.title).toBe('Another screen');
    keep(undefined);
    expect(document.title).toBe('The site');
    // a head that says no title is the document's own as well
    keep({ title: 'Back' });
    keep({ description: 'no title here' });
    expect(document.title).toBe('The site');
  });
});
