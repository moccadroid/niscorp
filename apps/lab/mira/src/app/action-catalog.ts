import type { ActionDefinition } from '@niscorp/nova';
import { textAction } from './actions/answer/text.action';
import { dockAction } from './actions/ask/dock.action';
import { listAction } from './actions/people/list.action';
import { doorAction } from './actions/signin/door.action';

// What the model may put on a screen, each opened with an input its schema takes. Its words are `answer.text`, placed
// by saying them; the dock and the sign-in are never placed.
export const placeable: readonly ActionDefinition[] = [listAction];

export const actions: Record<string, ActionDefinition> = Object.fromEntries([dockAction, textAction, doorAction, ...placeable].map((action) => [action.id, action]));
