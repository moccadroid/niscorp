import type { ActionDefinition } from '@niscorp/nova';
import { loginAction } from './actions/surfaces/auth/login.action';
import { aboutPageAction, aboutWhoAction } from './actions/surfaces/about/about.actions';
import { assistantAction } from './actions/surfaces/assistant/assistant.action';
import { guestChromeAction } from './actions/chrome/guest.action';
import { staffChromeAction } from './actions/chrome/staff.action';
import { conciergeAction, conciergeInputSchema } from './actions/domains/guest/concierge.action';
import {
  stayOverviewAction,
  stayOverviewInputSchema,
} from './actions/domains/guest/overview.action';
import { stayKeyAction, stayKeyInputSchema } from './actions/domains/guest/key.action';
import { stayCheckinAction, stayCheckinInputSchema } from './actions/domains/guest/checkin.action';
import {
  stayCheckoutAction,
  stayCheckoutInputSchema,
} from './actions/domains/guest/checkout.action';
import { stayFolioAction, stayFolioInputSchema } from './actions/domains/guest/folio.action';
import { stayMessageAction, stayMessageInputSchema } from './actions/domains/guest/message.action';
import { stayRequestAction, stayRequestInputSchema } from './actions/domains/guest/request.action';
import {
  issueTileAction,
  issueTileInputSchema,
  issueListAction,
  issueListInputSchema,
  issueDetailAction,
  issueDetailInputSchema,
} from './actions/domains/desk/issue.actions';
import { staffMenuAction, staffMenuInputSchema } from './actions/domains/staff/menu.action';
import { staffSettingsAction, staffSettingsInputSchema } from './actions/domains/staff/settings.action';
import {
  messageTileAction,
  messageTileInputSchema,
  messageListAction,
  messageListInputSchema,
  threadDetailAction,
  threadDetailInputSchema,
} from './actions/domains/desk/message.actions';
import { deskMovementsAction, deskMovementsInputSchema } from './actions/domains/desk/movements.action';
import { deskKeysAction, deskKeysInputSchema } from './actions/domains/desk/keys.action';
import { deskGuestAction, deskGuestInputSchema } from './actions/domains/desk/guest.action';
import { deskAttentionAction, deskAttentionInputSchema } from './actions/domains/desk/attention.action';
import { deskBriefAction, deskBriefInputSchema } from './actions/domains/desk/brief.action';
import { deskMoveAction, deskMoveInputSchema } from './actions/domains/desk/move.action';
import { deskNoteAction, deskNoteInputSchema } from './actions/domains/desk/note.action';
import { deskRequestAction, deskRequestInputSchema } from './actions/domains/desk/request.action';
import { deskEscalateAction, deskEscalateInputSchema } from './actions/domains/desk/escalate.action';
import { deskRoomsAction, deskRoomsInputSchema } from './actions/domains/desk/rooms.action';
import { deskHandoverAction, deskHandoverInputSchema } from './actions/domains/desk/handover.action';
import { deskArrivalAction, deskArrivalInputSchema, deskGroupAction, deskGroupInputSchema } from './actions/domains/desk/arrival.actions';
import {
  serviceTasksAction,
  serviceTasksInputSchema,
} from './actions/domains/service/tasks.action';
import { opsIssuesAction, opsIssuesInputSchema } from './actions/domains/ops/issues.action';
import { opsRoomsAction, opsRoomsInputSchema } from './actions/domains/ops/rooms.action';
import {
  opsIntegrationsAction,
  opsIntegrationsInputSchema,
} from './actions/domains/ops/integrations.action';
import { deployConnectorsAction, deployConnectorsInputSchema } from './actions/domains/deploy/connectors.action';
import { deployRolloutAction, deployRolloutInputSchema } from './actions/domains/deploy/rollout.action';

const withInput = (
  definition: ActionDefinition,
  input: Record<string, unknown>,
): ActionDefinition => ({ ...definition, input });

export const CATALOG_DEFINITIONS: Record<string, ActionDefinition> = {
  'auth.login': loginAction,
  assistant: assistantAction,

  'chrome.guest': guestChromeAction,
  'chrome.staff': staffChromeAction,

  'about.page': aboutPageAction,
  'about.who': aboutWhoAction,

  concierge: withInput(conciergeAction, conciergeInputSchema),
  'stay.overview': withInput(stayOverviewAction, stayOverviewInputSchema),
  'stay.key': withInput(stayKeyAction, stayKeyInputSchema),
  'stay.checkin': withInput(stayCheckinAction, stayCheckinInputSchema),
  'stay.checkout': withInput(stayCheckoutAction, stayCheckoutInputSchema),
  'stay.folio': withInput(stayFolioAction, stayFolioInputSchema),
  'stay.message': withInput(stayMessageAction, stayMessageInputSchema),
  'stay.request': withInput(stayRequestAction, stayRequestInputSchema),

  'staff.menu': withInput(staffMenuAction, staffMenuInputSchema),
  'staff.settings.form': withInput(staffSettingsAction, staffSettingsInputSchema),
  'desk.issue.tile': withInput(issueTileAction, issueTileInputSchema),
  'desk.issue.list': withInput(issueListAction, issueListInputSchema),
  'desk.issue.detail': withInput(issueDetailAction, issueDetailInputSchema),
  'desk.message.tile': withInput(messageTileAction, messageTileInputSchema),
  'desk.message.list': withInput(messageListAction, messageListInputSchema),
  'desk.thread.detail': withInput(threadDetailAction, threadDetailInputSchema),
  'desk.movements': withInput(deskMovementsAction, deskMovementsInputSchema),
  'desk.keys': withInput(deskKeysAction, deskKeysInputSchema),
  'desk.guest': withInput(deskGuestAction, deskGuestInputSchema),
  'desk.attention': withInput(deskAttentionAction, deskAttentionInputSchema),
  'desk.brief': withInput(deskBriefAction, deskBriefInputSchema),
  'desk.move': withInput(deskMoveAction, deskMoveInputSchema),
  'desk.note': withInput(deskNoteAction, deskNoteInputSchema),
  'desk.request': withInput(deskRequestAction, deskRequestInputSchema),
  'desk.escalate': withInput(deskEscalateAction, deskEscalateInputSchema),
  'desk.rooms': withInput(deskRoomsAction, deskRoomsInputSchema),
  'desk.handover': withInput(deskHandoverAction, deskHandoverInputSchema),
  'desk.arrival': withInput(deskArrivalAction, deskArrivalInputSchema),
  'desk.group': withInput(deskGroupAction, deskGroupInputSchema),

  'service.tasks': withInput(serviceTasksAction, serviceTasksInputSchema),

  'ops.issues': withInput(opsIssuesAction, opsIssuesInputSchema),
  'ops.rooms': withInput(opsRoomsAction, opsRoomsInputSchema),
  'ops.integrations': withInput(opsIntegrationsAction, opsIntegrationsInputSchema),

  'deploy.connectors': withInput(deployConnectorsAction, deployConnectorsInputSchema),
  'deploy.rollout': withInput(deployRolloutAction, deployRolloutInputSchema),
};
