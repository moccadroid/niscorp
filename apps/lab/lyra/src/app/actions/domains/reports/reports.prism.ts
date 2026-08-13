import { attendanceByHour, attendanceByProgram, attendanceByWeek, membersByStatus, planUptake } from '@lyra/app/vex/reports.entries';

export const attendanceByHourPrism = { fingerprint: attendanceByHour.fingerprint, context: { from: { $ref: '$.from' }, to: { $ref: '$.to' } } };
export const attendanceByWeekPrism = { fingerprint: attendanceByWeek.fingerprint, context: { from: { $ref: '$.from' }, to: { $ref: '$.to' } } };
export const attendanceByProgramPrism = { fingerprint: attendanceByProgram.fingerprint, context: { from: { $ref: '$.from' }, to: { $ref: '$.to' } } };
export const membersByStatusPrism = { fingerprint: membersByStatus.fingerprint, context: {} };
export const planUptakePrism = { fingerprint: planUptake.fingerprint, context: {} };
