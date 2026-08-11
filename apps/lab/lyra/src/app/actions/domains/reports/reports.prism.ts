import { attendanceByHour, attendanceByProgram, attendanceByWeek, membersByStatus, planUptake } from '@lyra/app/vex/reports.entries';

// Every one of these takes no context. They are whole-studio figures, and the
// studio is the engine's to know — so there is nothing to parameterise and
// nothing a request could point somewhere else.
// THE SAME WINDOW FOR ALL THREE. Three reports over one date range is one
// question asked three ways, so they take the same two values from the same
// action data — a screen where the charts disagreed about which period they were
// showing would be worse than one with no dates at all.
export const attendanceByHourPrism = { fingerprint: attendanceByHour.fingerprint, context: { from: { $ref: '$.from' }, to: { $ref: '$.to' } } };
export const attendanceByWeekPrism = { fingerprint: attendanceByWeek.fingerprint, context: { from: { $ref: '$.from' }, to: { $ref: '$.to' } } };
export const attendanceByProgramPrism = { fingerprint: attendanceByProgram.fingerprint, context: { from: { $ref: '$.from' }, to: { $ref: '$.to' } } };
export const membersByStatusPrism = { fingerprint: membersByStatus.fingerprint, context: {} };
export const planUptakePrism = { fingerprint: planUptake.fingerprint, context: {} };
