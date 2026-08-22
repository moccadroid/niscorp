import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';

import type { JsonValue, EvalContext, EvaluateFn } from '../types';
import type { DateNode, DateAddNode, DateDiffNode } from '../schemas';
import { PrismError, ErrorCode } from '../errors';

dayjs.extend(utc);

// A DATE IS NOT A TIMESTAMP. "2026-06-01" names a calendar day; dayjs parses
// it at LOCAL midnight, and toISOString then converts to UTC — so on any
// positive-offset machine `first-of-month + 1 month - 1 day` came back
// "2026-06-29T22:00:00.000Z" instead of June 30. Range filters built that way
// silently dropped their boundary day (measured: a month's deals losing the
// 30th). Date-only input is parsed and computed in UTC so the calendar day
// survives the round trip.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const isDateOnly = (value: JsonValue): boolean => typeof value === 'string' && DATE_ONLY.test(value);

const parseDate = (value: JsonValue, op: string): dayjs.Dayjs => {
  if (typeof value !== 'string' && typeof value !== 'number')
    throw new PrismError(`Expected string or number for ${op}`, ErrorCode.TYPE, { op });
  const d = isDateOnly(value) ? dayjs.utc(value) : dayjs(value);
  if (!d.isValid())
    throw new PrismError(`Invalid date for ${op}: ${String(value)}`, ErrorCode.DATE_INVALID, { op });
  return d;
};

export const opDate = (node: DateNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$date.value, context);
  const d = parseDate(value, '$date');
  const instance = node.$date.utc ? d.utc() : d;
  if (node.$date.format) return instance.format(node.$date.format);
  return instance.toISOString();
};

export const opDateAdd = (node: DateAddNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$dateAdd.date, context);
  const d = parseDate(value, '$dateAdd');
  const moved = d.add(node.$dateAdd.amount, node.$dateAdd.unit);
  // Date in, date out — a calendar day that entered as "2026-06-01" leaves as
  // a calendar day, not an instant carrying somebody's timezone.
  return isDateOnly(value) ? moved.format('YYYY-MM-DD') : moved.toISOString();
};

export const opDateDiff = (node: DateDiffNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const from = evaluate(node.$dateDiff.from, context);
  const to = evaluate(node.$dateDiff.to, context);
  const fromDate = parseDate(from, '$dateDiff.from');
  const toDate = parseDate(to, '$dateDiff.to');
  return toDate.diff(fromDate, node.$dateDiff.unit);
};
