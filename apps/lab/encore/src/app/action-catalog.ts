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

export const CATALOG_DEFINITIONS: Record<string, ActionDefinition> = Object.fromEntries(DEFINITIONS.map((definition) => [definition.id, withReload(definition, ENTRIES)]));
