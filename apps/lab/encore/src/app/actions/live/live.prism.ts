import { weatherForDay, weatherAtHour } from '@encore/app/vex/weather.entries';
import { zoneCount, attendanceTotal, attendanceByZone } from '@encore/app/vex/site.entries';
import { delaysRecent, incidentsOpen, lineupAround, weatherWarnings } from '@encore/app/vex/situation.entries';

export const weatherForDayPrism = {
  fingerprint: weatherForDay.fingerprint,
  context: { day: { $ref: '$.day' } },
};

export const weatherAtHourPrism = {
  fingerprint: weatherAtHour.fingerprint,
  context: { day: { $ref: '$.day' }, hour: { $ref: '$.hour' } },
};

export const zoneCountPrism = {
  fingerprint: zoneCount.fingerprint,
  context: { zoneId: { $ref: '$.zoneId' }, day: { $ref: '$.day' }, hour: { $ref: '$.hour' } },
};

export const attendanceTotalPrism = {
  fingerprint: attendanceTotal.fingerprint,
  context: { day: { $ref: '$.day' }, hour: { $ref: '$.hour' } },
};

export const attendanceByZonePrism = {
  fingerprint: attendanceByZone.fingerprint,
  context: { day: { $ref: '$.day' }, hour: { $ref: '$.hour' } },
};

const HOURS_AHEAD = 3;
const hourAhead = { $add: [{ $ref: '$.hour' }, HOURS_AHEAD] };

export const onStagePrism = {
  fingerprint: lineupAround.fingerprint,
  context: { day: { $ref: '$.day' }, fromMin: { $mul: [{ $ref: '$.hour' }, 60] }, toMin: { $mul: [hourAhead, 60] } },
};

export const weatherWarningsPrism = {
  fingerprint: weatherWarnings.fingerprint,
  context: { day: { $ref: '$.day' }, fromHour: { $ref: '$.hour' }, toHour: hourAhead },
};

export const incidentsOpenPrism = { fingerprint: incidentsOpen.fingerprint, context: {} };

export const delaysRecentPrism = { fingerprint: delaysRecent.fingerprint, context: {} };
