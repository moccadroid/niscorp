import type { ActionDefinition } from '@niscorp/nova';
import { TAB_BUTTON, TAB_INPUT, TAB_OPENED } from '@lyceum/app/actions/shared/tab.layouts';
import { xrayViewLayout } from './xray.layouts';

// THE X-RAY — somebody's own screen, as data. The speaker gives it to everybody
// (tools/xray.action.ts): a grant row each. It can render as a tab, so once
// granted it is on their phone's bar like the assistant (server/seeds.ts).
// Pressed, the body shows every action on the screen, which canvas it is on,
// and its data — what the shell on the server holds for this person, read as
// them (server/functions/xray.functions.ts). Nothing on it is code.
export const xrayAction: ActionDefinition = {
  id: 'xray.view',
  description: 'The person\'s own screen as data: every action on it, the canvas it is on, and its data.',
  title: 'X-ray',
  data: { tab: false, tabLabel: 'X-ray', tabInk: 'paper', nextInk: 'paper', screen: [], loading: true },
  input: TAB_INPUT,
  layout: { if: '$.tab', then: TAB_BUTTON, else: xrayViewLayout },
  endpoints: { screen: { fn: 'xray.screen', target: 'screen' } },
  lifecycle: { mount: [{ call: 'screen', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [
    { event: 'ui:click', ref: 'open', do: [{ set: 'nextInk', value: 'ink' }, { emit: { channel: 'tab-opened' } }, { resetTo: { action: 'xray.view', canvas: 'body' } }] },
    { event: 'ui:click', ref: 'again', do: [{ call: 'screen' }] },
    TAB_OPENED,
  ],
};

export const XRAY_ACTIONS: readonly ActionDefinition[] = [xrayAction];
