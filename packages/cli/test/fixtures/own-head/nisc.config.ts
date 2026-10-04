import { JSDOM } from 'jsdom';
import { createShell, shellView, ACTION_SLOT_NAME, CANVAS_SLOT_NAME, HEAD_LINK_NAME, HEAD_META_NAME, HEAD_NAME, HEAD_SCRIPT_NAME, HEAD_TITLE_NAME } from '@niscorp/nova';
import type { ActionDefinition, LayoutNode, Shell } from '@niscorp/nova';
import { mountShell } from '@niscorp/nova/adapters/dom';
import { defaultRegistry, fallback } from '@niscorp/nova/adapters/dom/components';
import { renderToString } from '@niscorp/nova/adapters/dom/server';
import type { NiscShellProject } from '../../../src';

// An app with its own shell and more than one page: `/` is a list with no head
// of its own, and each article has one in its layout (`nova:head`, holding the
// elements a head holds, bound to its data). So a build has a path whose head
// is the template's and paths whose head is their own.
//
// NISC_FIXTURE_FAULT breaks it one way at a time: `head` makes two boots of one
// path say different heads while drawing the same markup; `runs` puts a script
// that would execute into an article's head.
const fault = process.env['NISC_FIXTURE_FAULT'] ?? '';

const ARTICLES: Record<string, { title: string; lead: string; card: string }> = {
  types: { title: 'Types & <tags>', lead: 'What a "type" can promise.', card: 'https://example.com/articles/types/og.png' },
  loops: { title: 'Loops', lead: 'Once more around.', card: 'https://example.com/articles/loops/og.png' },
};

const list: ActionDefinition = {
  id: 'list',
  data: { heading: 'Articles' },
  layout: { component: 'Stack', children: [{ component: 'Text', children: '$.heading' }] },
};

const meta = (props: Record<string, unknown>): LayoutNode => ({ component: HEAD_META_NAME, props });

const article: ActionDefinition = {
  id: 'article',
  data: { page: { title: '', lead: '', card: '' }, stamp: '' },
  layout: {
    component: 'Stack',
    children: [
      {
        component: HEAD_NAME,
        children: [
          { component: HEAD_TITLE_NAME, children: '{{$.page.title}} · The site' },
          meta({ name: 'description', content: '{{$.page.lead}}{{$.stamp}}' }),
          meta({ property: 'og:type', content: 'article' }),
          meta({ property: 'og:title', content: '$.page.title' }),
          meta({ property: 'og:image', content: '$.page.card' }),
          meta({ property: 'og:image:alt', content: '$.page.title' }),
          { component: HEAD_LINK_NAME, props: { rel: 'alternate', type: 'application/rss+xml', href: '/feed.xml' } },
          { component: HEAD_SCRIPT_NAME, props: { type: 'application/ld+json', data: { '@context': 'https://schema.org', '@type': 'Article', headline: '$.page.title', image: '$.page.card' } } },
          ...(fault === 'runs' ? [{ component: HEAD_SCRIPT_NAME, props: { type: 'text/javascript', data: 'alert(1)' } }] : []),
        ],
      },
      { component: 'Text', children: '$.page.title' },
      { component: 'Text', children: '$.page.lead' },
    ],
  },
};

const kit = (): ReturnType<typeof defaultRegistry> => {
  const registry = defaultRegistry();
  registry.register(CANVAS_SLOT_NAME, fallback);
  registry.register(ACTION_SLOT_NAME, fallback);
  return registry;
};

// The boot — the one a browser entry would run. The path says which action,
// and with what: `/articles/<slug>/` is that article, everything else the list.
const boot = (path: string): Shell => {
  let minted = 0;
  const slug = /^\/articles\/([^/]+)\/?$/.exec(path)?.[1];
  const page = slug === undefined ? undefined : ARTICLES[slug];
  return createShell({
    registry: kit(),
    canvases: [{ id: 'main', initial: page === undefined ? 'list' : { action: 'article', input: { page, stamp: fault === 'head' ? ` ${Math.random()}` : '' } } }],
    actions: { list, article },
    instanceIdFn: () => `act-${(minted += 1)}`,
  });
};

export const project: NiscShellProject = {
  shell: async ({ path }) => ({ shell: boot(path) }),
  draw: (shell) => renderToString(kit(), shellView(shell).api, { window: new JSDOM('').window, fallback }),
  adopt: (root, shell) => {
    mountShell(root, kit(), shell, { fallback });
  },
  paths: () => ['/', '/articles/types/', '/articles/loops/'],
  site: 'https://example.com',
  waitMs: 400,
  dist: 'built',
};
