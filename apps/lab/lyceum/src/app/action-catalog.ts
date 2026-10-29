import type { ActionDefinition } from '@niscorp/nova';
import { doorAction } from './actions/door/door.action';
import { phoneAction } from './actions/member/phone.action';
import { queryResultAction } from './actions/query/result.action';
import { questionSendAction } from './actions/questions/send.action';
import { consoleAction } from './actions/speaker/console.action';
import { headAction } from './actions/speaker/head.action';
import { notesAction } from './actions/speaker/notes.action';
import { controlsAction } from './actions/speaker/controls.action';
import { speakerDeckAction } from './actions/speaker/deck.action';
import { slidesAction } from './actions/speaker/slides.action';
import { talksAction } from './actions/speaker/talks.action';
import { notificationAction } from './actions/speaker/notification.action';
import { resetAction } from './actions/speaker/reset.action';
import { timersAction } from './actions/speaker/timers.action';
import { lookTool } from './actions/tools/look.action';
import { integrationsTool } from './actions/tools/integrations.action';
import { assistantAction } from './actions/assistant/assistant.action';
import { stageRegisterAction } from './actions/stage/register.action';
import { deckAction } from './actions/stage/deck.action';
import { stripAction } from './actions/stage/strip.action';
import { sinkAction } from './actions/kit/sink.action';
import { signinAction } from './actions/lectern/signin.action';
import { SLIDE_ACTIONS } from './actions/slide/slide.actions';
import { askerTool, assistantTool, xrayTool } from './actions/tools/give.actions';
import { askRecordsAction, askTool } from './actions/ask/ask.actions';
import { searchTool } from './actions/tools/search.action';
import { xrayDocumentAction } from './actions/xray/document.action';
import { xraySwitchAction } from './actions/xray/switch.action';
import { CUE_TOOLS } from './actions/tools/cue.actions';
import { buttonTool } from './actions/tools/button.action';
import { stepTool } from './actions/tools/step.action';
import { buttonPressAction } from './actions/button/press.action';

export const ACTIONS: Record<string, ActionDefinition> = Object.fromEntries(
  [
    doorAction,
    phoneAction,
    queryResultAction,
    questionSendAction,
    consoleAction,
    headAction,
    notesAction,
    controlsAction,
    speakerDeckAction,
    slidesAction,
    talksAction,
    notificationAction,
    resetAction,
    timersAction,
    lookTool,
    xrayTool,
    assistantTool,
    askerTool,
    askTool,
    askRecordsAction,
    searchTool,
    xrayDocumentAction,
    xraySwitchAction,
    integrationsTool,
    buttonTool,
    stepTool,
    buttonPressAction,
    assistantAction,
    stageRegisterAction,
    deckAction,
    stripAction,
    sinkAction,
    signinAction,
    ...SLIDE_ACTIONS,
    ...CUE_TOOLS,
  ].map((action) => [action.id, action]),
);
