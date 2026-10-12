import type { ActionDefinition } from '@niscorp/nova';
import { sidebarLayout } from './sidebar.layout';
import { sidebarCountsPrism } from './sidebar.prism';

export const sidebarAction: ActionDefinition = {
  id: 'chrome.sidebar',
  // `nav` and `user` are seeded at boot from the principal's resolved catalog:
  // a nav item renders only when its screen is granted.
  data: {
    active: 'home',
    counts: { contacts: 0, companies: 0, deals: 0, tasks: 0 },
    nav: { home: true, tasks: true, pipeline: true, contacts: true, companies: true, deals: true, settings: true },
    user: { name: '', roles: '' },
  },
  layout: sidebarLayout,
  endpoints: {
    loadCounts: { url: '/api/vex', method: 'POST', request: sidebarCountsPrism, target: 'counts' },
    signOut: { fn: 'auth.signOut' },
  },
  lifecycle: { mount: [{ call: 'loadCounts' }] },
  triggers: [
    { event: 'ui:click', ref: 'nav-home', do: [{ resetTo: { action: 'home', canvas: 'main' } }, { emit: { channel: 'nav' } }, { emit: { channel: 'screen-home' } }] },
    { event: 'ui:click', ref: 'nav-tasks', do: [{ resetTo: { action: 'tasks.manage', canvas: 'main' } }, { emit: { channel: 'nav' } }, { emit: { channel: 'screen-tasks' } }] },
    { event: 'ui:click', ref: 'nav-pipeline', do: [{ resetTo: { action: 'crm.deals', canvas: 'main', input: { view: 'board' } } }, { emit: { channel: 'nav' } }, { emit: { channel: 'screen-pipeline' } }] },
    { event: 'ui:click', ref: 'nav-contacts', do: [{ resetTo: { action: 'crm.contacts', canvas: 'main' } }, { emit: { channel: 'nav' } }, { emit: { channel: 'screen-contacts' } }] },
    { event: 'ui:click', ref: 'nav-companies', do: [{ resetTo: { action: 'crm.companies', canvas: 'main' } }, { emit: { channel: 'nav' } }, { emit: { channel: 'screen-companies' } }] },
    { event: 'ui:click', ref: 'nav-deals', do: [{ resetTo: { action: 'crm.deals', canvas: 'main', input: { view: 'table' } } }, { emit: { channel: 'nav' } }, { emit: { channel: 'screen-deals' } }] },
    { event: 'ui:click', ref: 'nav-settings', do: [{ resetTo: { action: 'settings', canvas: 'main' } }, { emit: { channel: 'nav' } }, { emit: { channel: 'screen-settings' } }] },
    { message: 'screen-home', do: [{ set: 'active', value: 'home' }] },
    { message: 'screen-tasks', do: [{ set: 'active', value: 'tasks' }] },
    { message: 'screen-pipeline', do: [{ set: 'active', value: 'pipeline' }] },
    { message: 'screen-contacts', do: [{ set: 'active', value: 'contacts' }] },
    { message: 'screen-companies', do: [{ set: 'active', value: 'companies' }] },
    { message: 'screen-deals', do: [{ set: 'active', value: 'deals' }] },
    { message: 'screen-settings', do: [{ set: 'active', value: 'settings' }] },
    { event: 'ui:click', ref: 'sign-out', do: [{ call: 'signOut' }] },
  ],
};
