import type { ActionDefinition } from '@niscorp/nova';
import { textAction } from './actions/answer/text.action';
import { dockAction } from './actions/ask/dock.action';

// What the model may put on a screen, each opened with an input its schema takes. Its words are `answer.text`, placed
// by saying them; the dock is never placed.
export const placeable: readonly ActionDefinition[] = [];

export const actions: Record<string, ActionDefinition> = Object.fromEntries([dockAction, textAction, ...placeable].map((action) => [action.id, action]));
