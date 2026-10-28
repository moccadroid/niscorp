import type { ActionDefinition } from '@niscorp/nova';
import { textAction } from './actions/answer/text.action';
import { conversationAction } from './actions/ask/conversation.action';
import { deckAction } from './actions/ask/deck.action';
import { dockAction } from './actions/ask/dock.action';
import { suggestionsAction } from './actions/ask/suggestions.action';
import { listAction } from './actions/people/list.action';
import { doorAction } from './actions/signin/door.action';

// What the model may put on a screen, each opened with an input its schema takes. Its words are `answer.text`, placed
// by saying them; the dock, the overview, the conversation, the suggestions and the sign-in are never placed.
export const placeable: readonly ActionDefinition[] = [listAction];

export const actions: Record<string, ActionDefinition> = Object.fromEntries([dockAction, deckAction, conversationAction, suggestionsAction, textAction, doorAction, ...placeable].map((action) => [action.id, action]));
