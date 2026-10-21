import type { ActionDefinition } from '@niscorp/nova';
import { textAction } from './actions/answer/text.action';
import { dockAction } from './actions/ask/dock.action';
import { barsAction } from './actions/rows/bars.action';
import { formAction } from './actions/rows/form.action';
import { statAction } from './actions/rows/stat.action';
import { tableAction } from './actions/rows/table.action';

export const actions: Record<string, ActionDefinition> = Object.fromEntries(
  [dockAction, textAction, tableAction, statAction, barsAction, formAction].map((action) => [action.id, action]),
);
