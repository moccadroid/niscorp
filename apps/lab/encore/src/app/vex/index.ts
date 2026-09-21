import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { candidateActs, candidateStages, candidateZones } from './candidates.entries';
import { lineupForDay, lineupExposed, actById, stageById, stageCapacities, delaysForAct, slotSwap, delayAdd } from './lineup.entries';
import { impactAct, impactCapacity, impactCover, impactStageDay } from './impact.entries';
import { zonesHeat, zoneCount, attendanceTotal, attendanceByZone } from './site.entries';
import { weatherForDay, weatherAtHour, weatherWindow } from './weather.entries';
import { salesHourly, salesDaily, salesDayTotals } from './sales.entries';
import { pushesRecent, pushSend } from './push.entries';
import { delaysRecent, incidentsOpen, lineupAround, weatherWarnings } from './situation.entries';
import { threadAppend, threadTurns } from './thread.entries';
import { WATCH_ENTRIES } from './watch.entries';

// The whole API surface, as data: every read and write the app serves. moss
// seeds these protected and serves them locked, so a fingerprint that is not in
// this list is a 500, never a generated query.
export const ENTRIES: readonly (SeedEntry | SeedMutation)[] = [
  candidateActs,
  candidateStages,
  candidateZones,
  lineupForDay,
  actById,
  stageById,
  stageCapacities,
  delaysForAct,
  zonesHeat,
  zoneCount,
  attendanceTotal,
  attendanceByZone,
  weatherForDay,
  weatherAtHour,
  weatherWindow,
  salesHourly,
  salesDaily,
  salesDayTotals,
  pushesRecent,
  lineupAround,
  weatherWarnings,
  incidentsOpen,
  delaysRecent,
  threadTurns,
  lineupExposed,
  impactAct,
  impactCapacity,
  impactStageDay,
  impactCover,
  slotSwap,
  delayAdd,
  pushSend,
  threadAppend,
  ...WATCH_ENTRIES,
];
