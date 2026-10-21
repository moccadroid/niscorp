import type { ActionDefinition } from '@niscorp/nova';
import { textAction } from './actions/answer/text.action';
import { dockAction } from './actions/ask/dock.action';
import { GUIDE } from './actions/guide/guide.actions';

export const actions: Record<string, ActionDefinition> = Object.fromEntries([dockAction, textAction, ...GUIDE].map((action) => [action.id, action]));
