import type { ActionDefinition } from '@niscorp/nova';
import { doorAction } from './actions/door/door.action';
import { cardAction } from './actions/member/card.action';
import { phoneAction } from './actions/member/phone.action';
import { registerAction } from './actions/records/register.action';
import { renameAction } from './actions/forms/rename.action';
import { deskAction } from './actions/inquiries/desk.action';
import { logAction } from './actions/archive/log.action';
import { queryResultAction } from './actions/query/result.action';
import { questionSendAction } from './actions/questions/send.action';
import { questionDeskAction } from './actions/questions/desk.action';
import { questionsMineAction } from './actions/questions/mine.action';
import { questionEditAction } from './actions/questions/edit.action';
import { questionsTool } from './actions/tools/questions.action';
import { consoleAction } from './actions/speaker/console.action';
import { headAction } from './actions/speaker/head.action';
import { notesAction } from './actions/speaker/notes.action';
import { controlsAction } from './actions/speaker/controls.action';
import { speakerDeckAction } from './actions/speaker/deck.action';
import { slidesAction } from './actions/speaker/slides.action';
import { assignmentTool } from './actions/tools/assignment.action';
import { tallyTool } from './actions/tools/tally.action';
import { lookTool } from './actions/tools/look.action';
import { lookAction } from './actions/room/look.action';
import { assistantAction } from './actions/assistant/assistant.action';
import { stageRegisterAction } from './actions/stage/register.action';
import { deckAction } from './actions/stage/deck.action';
import { stripAction } from './actions/stage/strip.action';
import { sinkAction } from './actions/kit/sink.action';
import { signinAction } from './actions/lectern/signin.action';
import { SLIDE_ACTIONS } from './actions/slide/slide.actions';

// Ring 1: every action lyceum has. Which role is granted which is the
// charter's business.
export const ACTIONS: Record<string, ActionDefinition> = Object.fromEntries(
  [
    doorAction,
    cardAction,
    phoneAction,
    registerAction,
    renameAction,
    deskAction,
    logAction,
    queryResultAction,
    questionSendAction,
    questionDeskAction,
    questionsMineAction,
    questionEditAction,
    questionsTool,
    consoleAction,
    headAction,
    notesAction,
    controlsAction,
    speakerDeckAction,
    slidesAction,
    assignmentTool,
    tallyTool,
    lookTool,
    lookAction,
    assistantAction,
    stageRegisterAction,
    deckAction,
    stripAction,
    sinkAction,
    signinAction,
    ...SLIDE_ACTIONS,
  ].map((action) => [action.id, action]),
);
