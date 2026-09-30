import type { ActionDefinition } from '@niscorp/nova';
import { xrayViewLayout } from './xray.layouts';

// THE X-RAY — somebody's own screen, as data. The speaker gives it to everybody
// (tools/xray.action.ts): a grant row each, and it is on their phone's bar
// (member/phone.action.ts). Opened, it shows every action on the screen, whole —
// its data, endpoints, triggers and layout, as the shell on the server runs it
// for this person, read as them
// (server/functions/xray.functions.ts). Nothing on it is code.
export const xrayAction: ActionDefinition = {
  id: 'xray.view',
  description: 'The person\'s own screen as data: every action on it — its data, endpoints, triggers and layout.',
  title: 'X-ray',
  data: { screen: [], loading: true },
  layout: xrayViewLayout,
  endpoints: { screen: { fn: 'xray.screen', target: 'screen' } },
  lifecycle: { mount: [{ call: 'screen', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [{ event: 'ui:click', ref: 'again', do: [{ call: 'screen' }] }],
};

export const XRAY_ACTIONS: readonly ActionDefinition[] = [xrayAction];
