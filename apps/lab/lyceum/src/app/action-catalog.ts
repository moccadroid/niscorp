import type { ActionDefinition } from '@niscorp/nova';
import { doorAction } from './actions/door/door.action';
import { cardAction } from './actions/member/card.action';
import { crestAction } from './actions/house/crest.action';
import { consoleAction } from './actions/speaker/console.action';
import { rosterAction } from './actions/stage/roster.action';

// Ring 1: every action lyceum has. Who holds which is the charter's business.
export const ACTIONS: Record<string, ActionDefinition> = Object.fromEntries(
  [doorAction, cardAction, crestAction, consoleAction, rosterAction].map((action) => [action.id, action]),
);
