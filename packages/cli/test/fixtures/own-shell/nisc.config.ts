import { JSDOM } from 'jsdom';
import { createShell, shellView, ACTION_SLOT_NAME, CANVAS_SLOT_NAME } from '@niscorp/nova';
import type { ActionDefinition, Shell } from '@niscorp/nova';
import { mountShell } from '@niscorp/nova/adapters/dom';
import { defaultRegistry, fallback } from '@niscorp/nova/adapters/dom/components';
import { renderToString } from '@niscorp/nova/adapters/dom/server';
import type { NiscShellProject } from '../../../src';

const fault = process.env['NISC_FIXTURE_FAULT'] ?? '';

const rooms: ActionDefinition = {
  id: 'rooms',
  data: { title: 'Rooms & <suites>', rows: [], n: 0, loading: true },
  layout: {
    component: 'Stack',
    children: [
      { component: 'Text', children: '$.title' },
      { component: 'Text', children: '$.loading' },
      { component: 'Text', children: '$.n' },
      { component: 'Button', ref: 'bump', props: { label: 'bump' } },
    ],
  },
  endpoints: {
    load: { url: '/api/rooms', method: 'GET', target: 'rows' },
    save: { url: '/api/rooms/save', method: 'POST' },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [
    { event: 'ui:click', ref: 'bump', do: [{ increment: 'n' }, { call: 'save' }] },
    { message: 'rooms-changed', do: [{ call: 'load' }] },
  ],
};

const kit = (): ReturnType<typeof defaultRegistry> => {
  const registry = defaultRegistry();
  registry.register(CANVAS_SLOT_NAME, fallback);
  registry.register(ACTION_SLOT_NAME, fallback);
  return registry;
};

const titleOf = (): string => {
  if (fault === 'differs') return `Rooms ${Math.random()}`;
  if (fault === 'adopt' && typeof document !== 'undefined') return 'Rooms, in a page';
  return 'Rooms & <suites>';
};

const boot = (): Shell => {
  let minted = 0;
  return createShell({
    registry: kit(),
    canvases: [{ id: 'main', initial: 'rooms' }],
    actions: { rooms: { ...rooms, data: { ...rooms.data, title: titleOf() } } },
    instanceIdFn: () => `act-${(minted += 1)}`,
    fetch: async () => {
      await new Promise((done) => setTimeout(done, fault === 'slow' ? 2000 : 5));
      return { ok: true, status: 200, json: async () => [{ room_id: 'r1' }], text: async () => '[]' };
    },
  });
};

export const project: NiscShellProject = {
  shell: async () => ({ shell: boot() }),
  draw: (shell) => (fault === 'empty' ? '' : renderToString(kit(), shellView(shell).api, { window: new JSDOM('').window, fallback })),
  adopt: (root, shell) => {
    mountShell(root, kit(), shell, { fallback });
  },
  htmlAttributes: () => ({ 'data-palette': 'dusk' }),
  paths: () => ['/', '/rooms'],
  waitMs: 400,
  dist: 'built',
};
