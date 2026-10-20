import type { ActionDefinition } from '@niscorp/nova';
import { homeAction } from './actions/answer/home.action';
import { noticeAction } from './actions/answer/notice.action';
import { barAction } from './actions/ask/bar.action';
import { lineAction } from './actions/ask/line.action';
import { barsAction } from './actions/rows/bars.action';
import { formAction } from './actions/rows/form.action';
import { statAction } from './actions/rows/stat.action';
import { tableAction } from './actions/rows/table.action';

export const actions: Record<string, ActionDefinition> = Object.fromEntries(
  [lineAction, barAction, homeAction, noticeAction, tableAction, statAction, barsAction, formAction].map((action) => [action.id, action]),
);
