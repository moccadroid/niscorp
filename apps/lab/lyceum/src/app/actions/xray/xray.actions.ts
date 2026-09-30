import type { ActionDefinition } from '@niscorp/nova';
import { TAB_BUTTON, TAB_INPUT, TAB_OPENED } from '@lyceum/app/actions/shared/tab.layouts';
import { xrayViewLayout } from './xray.layouts';

// THE X-RAY — somebody's own screen, as data. The speaker gives it to everybody
// (tools/xray.action.ts): a grant row each, so it exists on their phone, as a
// tab in the bar like the others (the phone lists it; a phone not granted it
// skips it). Pressed, the body shows every action on the screen, which canvas
// it is on, and its data — what the shell on the server holds for this
// person, read as them (server/functions/xray.functions.ts). Nothing on it is
// code.
//
// Two actions, as with Q&A: the tab, and what it opens. The view reads the
// screen when it mounts; a tab that is the same action would read it too.

export const xrayTabAction: ActionDefinition = {
  id: 'xray.tab',
  description: 'The X-ray tab on the phone: opens the person\'s own screen as data in the phone\'s body.',
  title: 'X-ray',
  data: { tab: true, tabLabel: 'X-ray', tabInk: 'paper', nextInk: 'paper' },
  input: TAB_INPUT,
  layout: TAB_BUTTON,
  triggers: [
    { event: 'ui:click', ref: 'open', do: [{ set: 'nextInk', value: 'ink' }, { emit: { channel: 'tab-opened' } }, { resetTo: { action: 'xray.view', canvas: 'body' } }] },
    TAB_OPENED,
  ],
};

export const xrayViewAction: ActionDefinition = {
  id: 'xray.view',
  description: 'The person\'s own screen as data: every action on it, the canvas it is on, and its data.',
  title: 'Your screen, as data',
  data: { screen: [], loading: true },
  layout: xrayViewLayout,
  endpoints: { screen: { fn: 'xray.screen', target: 'screen' } },
  lifecycle: { mount: [{ call: 'screen', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [{ event: 'ui:click', ref: 'again', do: [{ call: 'screen' }] }],
};

export const XRAY_ACTIONS: readonly ActionDefinition[] = [xrayTabAction, xrayViewAction];
