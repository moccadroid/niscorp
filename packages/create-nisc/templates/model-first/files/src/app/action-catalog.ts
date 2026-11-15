import type { ActionDefinition } from '@niscorp/nova';
import { textAction } from './actions/answer/text.action';
import { turnAction } from './actions/answer/turn.action';
import { dockAction } from './actions/ask/dock.action';
import { GUIDE } from './actions/guide/guide.actions';

// What the model may show under its sentence, each opened with an input its schema takes. Its words are `answer.text`,
// placed by saying them; the dock and the turn are never placed by the model.
export const placeable: readonly ActionDefinition[] = GUIDE;

export const actions: Record<string, ActionDefinition> = Object.fromEntries([dockAction, textAction, turnAction, ...placeable].map((action) => [action.id, action]));
