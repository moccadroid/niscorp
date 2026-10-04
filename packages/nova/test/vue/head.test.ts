// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import type { ActionDefinition } from '@action';
import { HEAD_NAME, HEAD_TITLE_NAME } from '@layout';
import { createShell } from '@shell';
import type { Shell } from '@shell';
import { NovaShell } from '../../src/adapters/vue';

// ═══════════════════════════════════════════════════════════
// A head under the Vue adapter: nothing is drawn for it or what it holds, and
// the page's <head> follows it for as long as the shell lives in the page.
// ═══════════════════════════════════════════════════════════

const article: ActionDefinition = {
  id: 'article',
  data: { title: 'First title' },
  layout: {
    component: 'Stack',
    children: [
      { component: HEAD_NAME, children: [{ component: HEAD_TITLE_NAME, children: '$.title' }] },
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

const boot = (): Shell => createShell({ canvases: [{ id: 'main', initial: 'article' }], actions: { article, plain } });

const settle = async (): Promise<void> => {
  await flushPromises();
  await new Promise((r) => setTimeout(r, 5));
  await flushPromises();
};

beforeEach(() => {
  document.head.innerHTML = '<title>The site</title>';
});

describe('a head node, under the Vue adapter', () => {
  it('draws nothing, and names no tab where there is no browser', async () => {
    const shell = boot();
    await flushPromises();
    const html = await renderToString(createSSRApp({ render: () => h(NovaShell, { shell }) }));
    expect(html).not.toContain(HEAD_NAME);
    expect(html).toContain('First title');
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(document.title).toBe('The site');
  });

  it('the tab’s title follows the head: when it changes, and when the screen has none', async () => {
    const shell = boot();
    await flushPromises();
    const wrapper = mount(NovaShell, { props: { shell }, attachTo: document.body });
    await settle();
    expect(document.title).toBe('First title');

    const [rename, leave] = wrapper.findAll('button');
    await rename?.trigger('click');
    await settle();
    expect(document.title).toBe('Second title');

    // a screen with no head has the document's own title again
    await leave?.trigger('click');
    await settle();
    expect(wrapper.text()).toContain('no head here');
    expect(document.title).toBe('The site');
    wrapper.unmount();
  });
});
