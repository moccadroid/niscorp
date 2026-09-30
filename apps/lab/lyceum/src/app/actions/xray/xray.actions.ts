import type { ActionDefinition } from '@niscorp/nova';
import { xrayViewLayout } from './xray.layouts';

// THE X-RAY — somebody's own screen, as data. The speaker gives it to everybody
// (tools/xray.action.ts): a grant row each, and it is on their phone's bar
// (member/phone.action.ts). Opened, it shows every action on the screen and
// its data — what the shell on the server holds for this person, read as them
// (server/functions/xray.functions.ts). Nothing on it is code.
export const xrayAction: ActionDefinition = {
  id: 'xray.view',
  description: 'The person\'s own screen as data: every action on it and its data.',
  title: 'X-ray',
  data: { screen: [], loading: true },
  layout: xrayViewLayout,
  endpoints: { screen: { fn: 'xray.screen', target: 'screen' } },
  lifecycle: { mount: [{ call: 'screen', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [{ event: 'ui:click', ref: 'again', do: [{ call: 'screen' }] }],
};

export const XRAY_ACTIONS: readonly ActionDefinition[] = [xrayAction];
