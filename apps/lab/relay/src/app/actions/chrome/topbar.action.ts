import type { ActionDefinition } from '@niscorp/nova';
import { topbarLayout } from './topbar.layout';
import { topbarSearchPrism } from './topbar.prism';

// The topbar shows the active screen title and hosts the action search.
//
// The search Input (`model: $.search`, `ref: search`) emits `ui:model` (each keystroke
// re-runs `searchActions` into `$.results`) and `ui:key` (↑/↓ move `$.highlight`,
// Enter runs the highlighted action, Esc clears). A result row click carries its
// whole record. Running an action stashes its id/kind/name then `emit
// run-{{kind}}`: a `run-create` opens the form modal; a `run-screen` opens it as
// a quickview on the modal canvas (the QuickviewFragment, with an Open-fullscreen
// escape). Nothing navigates the main canvas from here — that's the quickview's
// fullscreen button. Push/replace resolve their `action` from `$.chosen_id`.
export const topbarAction: ActionDefinition = {
  id: 'chrome.topbar',
  data: { title: 'Home', search: '', results: [], highlight: 0, chosen_id: '', chosen_kind: '', chosen_name: '', allowedIds: [] },
  layout: topbarLayout,
  endpoints: { search: { url: '/api/vex', method: 'POST', request: topbarSearchPrism, target: 'results' } },
  triggers: [
    { event: 'ui:model', ref: 'search', do: [{ set: 'search', value: '@event.payload' }, { call: 'search', onSuccess: [{ set: 'highlight', value: 0 }] }] },
    { event: 'ui:key', ref: 'search', key: 'ArrowDown', do: [{ increment: 'highlight' }] },
    { event: 'ui:key', ref: 'search', key: 'ArrowUp', do: [{ decrement: 'highlight' }] },
    {
      event: 'ui:key',
      ref: 'search',
      key: 'Enter',
      do: [
        { set: 'chosen_id', value: { $at: ['$.results', '$.highlight', 'action_id'] } },
        { set: 'chosen_kind', value: { $at: ['$.results', '$.highlight', 'kind'] } },
        { set: 'chosen_name', value: { $at: ['$.results', '$.highlight', 'name'] } },
        { emit: { channel: 'run-{{$.chosen_kind}}' } },
      ],
    },
    { event: 'ui:key', ref: 'search', key: 'Escape', do: [{ set: 'search', value: '' }, { set: 'results', value: [] }] },
    {
      event: 'ui:click',
      ref: 'run',
      do: [
        { set: 'chosen_id', value: '@event.payload.action_id' },
        { set: 'chosen_kind', value: '@event.payload.kind' },
        { set: 'chosen_name', value: '@event.payload.name' },
        { emit: { channel: 'run-{{$.chosen_kind}}' } },
      ],
    },
    { event: 'ui:click', ref: 'search-close', do: [{ set: 'search', value: '' }, { set: 'results', value: [] }] },
    // A create opens the form modal; a screen opens as a quickview on the modal
    // canvas (carrying its id/name so the quickview can navigate + title itself).
    { message: 'run-create', do: [{ push: { action: '{{$.chosen_id}}', canvas: 'modal', with: ['modal'] } }, { set: 'search', value: '' }, { set: 'results', value: [] }] },
    {
      message: 'run-screen',
      do: [
        { push: { action: '{{$.chosen_id}}', canvas: 'modal', with: ['quickview'], input: { fullscreenAction: '{{$.chosen_id}}', quickviewTitle: '{{$.chosen_name}}' } } },
        { set: 'search', value: '' },
        { set: 'results', value: [] },
      ],
    },
    { event: 'ui:click', ref: 'new', do: [{ emit: { channel: 'new' } }] },
    // Open Ray, the assistant, as a modal panel.
    { event: 'ui:click', ref: 'assistant', do: [{ push: { action: 'assistant', canvas: 'modal', with: ['dock'] } }] },
    { message: 'screen-home', do: [{ set: 'title', value: 'Home' }] },
    { message: 'screen-tasks', do: [{ set: 'title', value: 'My tasks' }] },
    { message: 'screen-pipeline', do: [{ set: 'title', value: 'Pipeline' }] },
    { message: 'screen-contacts', do: [{ set: 'title', value: 'Contacts' }] },
    { message: 'screen-companies', do: [{ set: 'title', value: 'Companies' }] },
    { message: 'screen-deals', do: [{ set: 'title', value: 'Deals' }] },
    { message: 'screen-settings', do: [{ set: 'title', value: 'Settings' }] },
  ],
};
