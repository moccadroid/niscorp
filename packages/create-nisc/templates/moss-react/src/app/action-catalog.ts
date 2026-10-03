import type { ActionDefinition } from '@niscorp/nova';
import { welcomeAction } from './actions/surfaces/welcome.action';

// Ring 1: every action the app ships, by id. Which of them exist for a given
// principal is the charter's answer, not this file's.
export const actions: Record<string, ActionDefinition> = {
  [welcomeAction.id]: welcomeAction,
};
