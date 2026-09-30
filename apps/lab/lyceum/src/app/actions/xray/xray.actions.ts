import type { ActionDefinition } from '@niscorp/nova';
import { xrayButtonLayout, xrayViewLayout } from './xray.layouts';

// THE X-RAY — somebody's own screen, as data. The speaker gives it to everybody
// (tools/xray.action.ts): a grant row each, so it exists on their phone, as
// one large button over everything else there. Pressed, it opens the view over
// the screen: every action on it, which canvas it is on, and its data — what
// the shell on the server holds for this person, read as them
// (server/functions/xray.functions.ts). Nothing on it is code.

export const xrayButtonAction: ActionDefinition = {
  id: 'xray.button',
  description: 'A large button that opens the person\'s own screen as data: every action on it and its data.',
  title: 'X-ray',
  data: {},
  layout: xrayButtonLayout,
  triggers: [{ event: 'ui:click', ref: 'open', do: [{ push: { action: 'xray.view', canvas: 'overlay', with: ['sheet'], input: { sheetTitle: 'Your screen, as data' } } }] }],
};

export const xrayViewAction: ActionDefinition = {
  id: 'xray.view',
  description: 'The person\'s own screen as data: every action on it, the canvas it is on, and its data.',
  title: 'Your screen, as data',
  data: { screen: [], loading: true, sheetTitle: 'Your screen, as data' },
  layout: xrayViewLayout,
  endpoints: { screen: { fn: 'xray.screen', target: 'screen' } },
  lifecycle: { mount: [{ call: 'screen', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [{ event: 'ui:click', ref: 'again', do: [{ call: 'screen' }] }],
};

export const XRAY_ACTIONS: readonly ActionDefinition[] = [xrayButtonAction, xrayViewAction];
