import { withReload } from './reload-on-write';
import { ENTRIES } from './vex';
import type { ActionDefinition } from '@niscorp/nova';
import { intentLineAction } from './actions/frame/intent-line.action';
import { intentOptionsAction } from './actions/frame/intent-options.action';
import { intentTraceAction } from './actions/frame/intent-trace.action';
import { assistAnswerAction } from './actions/frame/assist-answer.action';
import { assistRailAction } from './actions/frame/assist-rail.action';
import { attentionStripAction } from './actions/frame/attention-strip.action';
import { directorDeckAction } from './actions/frame/director-deck.action';
import { moveImpactAction, moveImpactInputSchema } from './actions/live/move-impact.action';
import { siteMapAction, siteMapInputSchema } from './actions/spatial/site-map.action';
import { stageViewAction, stageViewInputSchema } from './actions/spatial/stage-view.action';
import { lineupTimelineAction, lineupTimelineInputSchema } from './actions/temporal/lineup-timeline.action';
import { actCardAction, actCardInputSchema } from './actions/temporal/act-card.action';
import { weatherRadarAction, weatherRadarInputSchema } from './actions/live/weather-radar.action';
import { crowdGaugeAction, crowdGaugeInputSchema } from './actions/live/crowd-gauge.action';
import { attendanceNowAction, attendanceNowInputSchema } from './actions/live/attendance-now.action';
import { situationNowAction, situationNowInputSchema } from './actions/live/situation-now.action';
import { incidentFeedAction } from './actions/live/incident-feed.action';
import { salesChartAction, salesChartInputSchema } from './actions/money/sales-chart.action';
import { slotSwapAction, slotSwapInputSchema } from './actions/do/slot-swap.action';
import { setDelayAction, setDelayInputSchema } from './actions/do/set-delay.action';
import { pushComposeAction, pushComposeInputSchema } from './actions/do/push-compose.action';

// Ring 1's universe: every action the app ships, by id.
//
// An action's `input` is its public contract — the data keys an opener may
// seed. Here the opener is a decision model, and this file is where that stops
// being a figure of speech: the intent loop reads `description` and `input` off
// exactly these definitions to derive its questions, so attaching a schema
// below is what makes a card openable by a sentence. The four frame actions
// carry none — nothing opens them by sentence; the manifest or the loop mounts them.
const withInput = (definition: ActionDefinition, input: Record<string, unknown>): ActionDefinition => ({ ...definition, input });

const DEFINITIONS: readonly ActionDefinition[] = [
  intentLineAction,
  intentOptionsAction,
  intentTraceAction,
  assistAnswerAction,
  assistRailAction,
  attentionStripAction,
  directorDeckAction,
  withInput(slotSwapAction, slotSwapInputSchema),
  withInput(setDelayAction, setDelayInputSchema),
  withInput(pushComposeAction, pushComposeInputSchema),
  withInput(actCardAction, actCardInputSchema),
  withInput(stageViewAction, stageViewInputSchema),
  withInput(siteMapAction, siteMapInputSchema),
  withInput(lineupTimelineAction, lineupTimelineInputSchema),
  withInput(weatherRadarAction, weatherRadarInputSchema),
  withInput(crowdGaugeAction, crowdGaugeInputSchema),
  withInput(attendanceNowAction, attendanceNowInputSchema),
  withInput(situationNowAction, situationNowInputSchema),
  withInput(moveImpactAction, moveImpactInputSchema),
  incidentFeedAction,
  withInput(salesChartAction, salesChartInputSchema),
];

// Every card re-reads when a table it shows is written (reload-on-write.ts): the
// trigger is composed HERE, onto all of them, from what each one's own endpoints
// replay — so no card carries one and none can be forgotten.
export const CATALOG_DEFINITIONS: Record<string, ActionDefinition> = Object.fromEntries(DEFINITIONS.map((definition) => [definition.id, withReload(definition, ENTRIES)]));
