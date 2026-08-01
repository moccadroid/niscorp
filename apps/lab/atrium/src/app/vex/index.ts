import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { surfaceLive, surfaceServing, surfaceMenu, surfaceMatrix, surfaceGuestMatrix } from './surface.entries';
import { requestOptions } from './catalog.entries';
import {
  stayCurrent,
  stayById,
  staysMovements,
  staysPick,
  folioForStay,
  folioTotal,
  messagesForStay,
  latestMessageForStay,
  messagesFeed,
  messageSend,
  staySetKey,
  staySetCheckedIn,
  staySetDeparted,
  folioPost,
  transfersForStay,
  transfersSheet,
  transferCancel,
  requestsForStay,
} from './stay.entries';
import {
  issuesBoard,
  issueById,
  issuesForStay,
  issuesOpenCount,
  issuesByKind,
  issuesByRoom,
  tasksAssigned,
  tasksForIssue,
  staffAtProperty,
  staffSettings,
  roomsForProperty,
  roomById,
  roomsFree,
  opsInHouse,
  opsArriving,
  opsOutOfOrder,
  opsNotReady,
  issueRaise,
  issueSetStatus,
  taskDispatch,
  taskRequest,
  taskSetStatus,
  roomSetStatus,
  staySetRoom,
  staffSetLayout,
  staffSetModel,
} from './service.entries';
import {
  stayVisitCount,
  guestForStay,
  notesForStay,
  noteAdd,
  messagesWaiting,
  issuesUnattended,
  staysDueIn,
  staysInGroup,
  staysInGroupReady,
  stayCheckInMany,
  groupById,
  handoversRecent,
  handoverWrite,
  staysMovementsToday,
  goodwillForStay,
  escalationRaise,
  tasksFrontOffice,
} from './desk.entries';
import { connectorsList, connectorOffer, connectorProperties, propertiesList, propertyCapabilities, connectorSetCapability, propertyCapabilitySet } from './deploy.entries';
import { propertyIntegrations, propertyServices } from './integrations.entries';
import { assistantPersona, assistantTurns, assistantLog, assistantAppend, assistantMeter } from './assistant.entries';
import { seenLast, unreadForDesk, unreadForStay, seenMark } from './seen.entries';

// ═══════════════════════════════════════════════════════════
// The data API = the description of Vex's PREWARMED CACHE.
//
// Atrium wires NO llm hooks, so this list is the complete API surface: every
// read and every write replays a named fingerprint, and a fingerprint that is
// not here is a 500 rather than a silent generate. That matters more here than
// in most apps — the concierge chooses from resolved rows, so the blast radius
// of a bad choice is "an action that already existed opens", never a query
// nobody wrote.
// ═══════════════════════════════════════════════════════════

export type CacheEntry = SeedEntry;
export type MutationEntry = SeedMutation;

export const ENTRIES: CacheEntry[] = [
  // the resolved surface — what exists for whom, and why
  surfaceLive,
  surfaceServing,
  surfaceMenu,
  surfaceMatrix,
  surfaceGuestMatrix,
  // the request catalogue, shipped by the connectors
  requestOptions,
  // the stay, mirrored from whichever PMS owns it
  stayCurrent,
  stayById,
  staysMovements,
  staysPick,
  folioForStay,
  folioTotal,
  messagesForStay,
  latestMessageForStay,
  messagesFeed,
  transfersForStay,
  transfersSheet,
  requestsForStay,
  // what happens in our system and nowhere else
  issuesBoard,
  issueById,
  issuesForStay,
  issuesOpenCount,
  issuesByKind,
  issuesByRoom,
  tasksAssigned,
  tasksForIssue,
  staffAtProperty,
  staffSettings,
  roomsForProperty,
  roomById,
  roomsFree,
  opsInHouse,
  opsArriving,
  opsOutOfOrder,
  opsNotReady,
  // the front desk's own working reads: who is waiting, who is due, who this is
  stayVisitCount,
  guestForStay,
  notesForStay,
  messagesWaiting,
  issuesUnattended,
  staysDueIn,
  staysInGroup,
  staysInGroupReady,
  groupById,
  handoversRecent,
  staysMovementsToday,
  goodwillForStay,
  tasksFrontOffice,
  // the integrator's own console
  connectorsList,
  connectorOffer,
  connectorProperties,
  propertiesList,
  propertyCapabilities,
  // the hotel's own integrations pane
  propertyIntegrations,
  propertyServices,
  // the assistant: persona + the caller's durable conversation
  assistantPersona,
  assistantTurns,
  assistantLog,
  // unread without a push: mark + threshold reads
  seenLast,
  unreadForDesk,
  unreadForStay,
];

export const MUTATION_ENTRIES: MutationEntry[] = [
  messageSend,
  staySetKey,
  staySetCheckedIn,
  staySetDeparted,
  folioPost,
  transferCancel,
  issueRaise,
  issueSetStatus,
  taskDispatch,
  taskRequest,
  taskSetStatus,
  roomSetStatus,
  staySetRoom,
  stayCheckInMany,
  noteAdd,
  handoverWrite,
  escalationRaise,
  staffSetLayout,
  staffSetModel,
  connectorSetCapability,
  propertyCapabilitySet,
  assistantAppend,
  assistantMeter,
  seenMark,
];
