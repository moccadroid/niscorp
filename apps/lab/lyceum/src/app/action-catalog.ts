import type { ActionDefinition } from '@niscorp/nova';
import { doorAction } from './actions/door/door.action';
import { cardAction } from './actions/member/card.action';
import { badgeAction } from './actions/department/badge.action';
import { registerAction } from './actions/records/register.action';
import { renameAction } from './actions/forms/rename.action';
import { deskAction } from './actions/inquiries/desk.action';
import { logAction } from './actions/archive/log.action';
import { consoleAction } from './actions/speaker/console.action';
import { speakerDeckAction } from './actions/speaker/deck.action';
import { assignmentTool } from './actions/tools/assignment.action';
import { noTool } from './actions/tools/none.action';
import { stageRegisterAction } from './actions/stage/register.action';
import { deckAction } from './actions/stage/deck.action';
import { stripAction } from './actions/stage/strip.action';
import { sinkAction } from './actions/kit/sink.action';
import { SLIDE_ACTIONS } from './actions/slide/slide.actions';

// Ring 1: every action lyceum has. Which role is granted which is the
// charter's business.
export const ACTIONS: Record<string, ActionDefinition> = Object.fromEntries(
  [
    doorAction,
    cardAction,
    badgeAction,
    registerAction,
    renameAction,
    deskAction,
    logAction,
    consoleAction,
    speakerDeckAction,
    assignmentTool,
    noTool,
    stageRegisterAction,
    deckAction,
    stripAction,
    sinkAction,
    ...SLIDE_ACTIONS,
  ].map((action) => [action.id, action]),
);
