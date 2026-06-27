import type { ActionDefinition } from '@niscorp/nova';
import { sidebarLayout } from './sidebar.layout';

// Each nav click replaces the action on the `main` canvas, emits `nav` (so an
// open detail self-closes — see contact-detail's `nav` trigger), and emits on a
// per-screen channel. The highlight (`$.active`) is driven by *listening* to
// those `screen-*` channels, not set inline — so navigation from anywhere (a
// nav click, a cross-link, or the URL router) keeps the highlight correct. A
// channel per screen avoids needing the message payload (triggers don't expose
// it). The topbar sets its title off the same channels.
export const sidebarAction: ActionDefinition = {
  id: 'sidebar',
  // `counts` holds the four nav badge numbers. ONE read fills them all: four
  // COUNT(*)s cross-joined into a single row. Live Vex data, not literals.
  data: { active: 'home', counts: { contacts: 0, companies: 0, deals: 0, tasks: 0 } },
  layout: sidebarLayout,
  endpoints: {
    loadCounts: { fn: 'sidebar.counts', target: 'counts' },
  },
  lifecycle: { mount: [{ call: 'loadCounts' }] },
  triggers: [
    { event: 'ui:click', ref: 'nav-home', do: [{ resetTo: { action: 'home', canvas: 'main' } }, { emit: { channel: 'nav' } }, { emit: { channel: 'screen-home' } }] },
    { event: 'ui:click', ref: 'nav-tasks', do: [{ resetTo: { action: 'tasks', canvas: 'main' } }, { emit: { channel: 'nav' } }, { emit: { channel: 'screen-tasks' } }] },
    { event: 'ui:click', ref: 'nav-pipeline', do: [{ resetTo: { action: 'deals', canvas: 'main', input: { view: 'board' } } }, { emit: { channel: 'nav' } }, { emit: { channel: 'screen-pipeline' } }] },
    { event: 'ui:click', ref: 'nav-contacts', do: [{ resetTo: { action: 'contacts', canvas: 'main' } }, { emit: { channel: 'nav' } }, { emit: { channel: 'screen-contacts' } }] },
    { event: 'ui:click', ref: 'nav-companies', do: [{ resetTo: { action: 'companies', canvas: 'main' } }, { emit: { channel: 'nav' } }, { emit: { channel: 'screen-companies' } }] },
    { event: 'ui:click', ref: 'nav-deals', do: [{ resetTo: { action: 'deals', canvas: 'main', input: { view: 'table' } } }, { emit: { channel: 'nav' } }, { emit: { channel: 'screen-deals' } }] },
    { event: 'ui:click', ref: 'nav-settings', do: [{ resetTo: { action: 'settings', canvas: 'main' } }, { emit: { channel: 'nav' } }, { emit: { channel: 'screen-settings' } }] },
    { message: 'screen-home', do: [{ set: 'active', value: 'home' }] },
    { message: 'screen-tasks', do: [{ set: 'active', value: 'tasks' }] },
    { message: 'screen-pipeline', do: [{ set: 'active', value: 'pipeline' }] },
    { message: 'screen-contacts', do: [{ set: 'active', value: 'contacts' }] },
    { message: 'screen-companies', do: [{ set: 'active', value: 'companies' }] },
    { message: 'screen-deals', do: [{ set: 'active', value: 'deals' }] },
    { message: 'screen-settings', do: [{ set: 'active', value: 'settings' }] },
  ],
};
