import type { ActionDefinition } from '@niscorp/nova';
import { welcomeAction } from './actions/surfaces/welcome.action';

export const actions: Record<string, ActionDefinition> = {
  [welcomeAction.id]: welcomeAction,
};
