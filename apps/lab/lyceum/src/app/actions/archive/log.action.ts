import type { ActionDefinition } from '@niscorp/nova';
import { TAB_BUTTON, TAB_INPUT } from '@lyceum/app/actions/shared/tab.layouts';
import { archiveHistory } from '@lyceum/app/vex/member.entries';
import { logLayout } from './log.layout';

// ARCHIVE'S clearance: the history — who arrived when, and where they went.
// A reactive read: new arrivals and assignments land at the top as they happen.
export const logAction: ActionDefinition = {
  id: 'archive.log',
  title: 'The archive',
  data: { tab: false, tabLabel: 'Archive', rows: [] },
  input: TAB_INPUT,
  layout: { if: '$.tab', then: TAB_BUTTON, else: logLayout },
  endpoints: {
    load: { url: '/api/vex', method: 'POST', request: { fingerprint: archiveHistory.fingerprint, context: {} }, target: 'rows' },
  },
  lifecycle: { mount: [{ call: 'load' }] },
  triggers: [{ event: 'ui:click', ref: 'open', do: [{ resetTo: { action: 'archive.log', canvas: 'body' } }] }],
};
