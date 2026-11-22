import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';

import type { JsonValue, EvalContext, EvaluateFn } from '../types';
import type { DateNode, DateAddNode, DateDiffNode } from '../schemas';
import { ErrorCode, clip, failAt } from '../errors';
import { refuseType } from './refuse';

dayjs.extend(utc);

// dayjs parses "2026-06-01" at local midnight and toISOString then converts to
// UTC, which east of Greenwich is the day before. A bare date is parsed and
// computed in UTC.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const isDateOnly = (value: JsonValue): boolean => typeof value === 'string' && DATE_ONLY.test(value);

// The machine's clock zone and its Intl data differ from one machine to the
// next: an op that reads them refuses to be worked out ahead of time, and the
// optimizer keeps it as an op, to be answered where it runs.
export const notAheadOfTime = (context: EvalContext): void => {
  if (context.folding === true) throw new Error('answered where it runs');
};

const ISO_FIELDS = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/;
const daysIn = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

// The platform's readers roll an out-of-range field over into the next one
// ("2026-02-30" is March 2nd). Only ISO-shaped text names its fields plainly
// enough to tell; any other text is read as before.
export const isImpossibleDate = (text: string): boolean => {
  const fields = ISO_FIELDS.exec(text);
  if (fields === null) return false;
  const [year = 0, month = 0, day = 0, hour = 0, minute = 0, second = 0] = fields.slice(1).map((field) => (field === undefined ? 0 : Number(field)));
  if (month < 1 || month > 12 || day < 1 || day > daysIn(year, month)) return true;
  if (hour === 24) return minute !== 0 || second !== 0;
  return hour > 23 || minute > 59 || second > 59;
};

const parseDate = (value: JsonValue, node: object, op: string, field: string, written: unknown, contextOp: string): dayjs.Dayjs => {
  if (typeof value !== 'string' && typeof value !== 'number')
    return refuseType({ node, op, field, needs: 'a date, as text or a number', got: value, written, contextOp });
  const d = isDateOnly(value) ? dayjs.utc(value) : dayjs(value);
  if (!d.isValid() || (typeof value === 'string' && isImpossibleDate(value)))
    return failAt(`Invalid date for ${contextOp}: ${clip(String(value), 60)}`, ErrorCode.DATE_INVALID, { op: contextOp }, { node, op, field, form: false });
  return d;
};

export const opDate = (node: DateNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  notAheadOfTime(context);
  const value = evaluate(node.$date.value, context);
  const d = parseDate(value, node, '$date', 'value', node.$date.value, '$date');
  const instance = node.$date.utc ? d.utc() : d;
  if (node.$date.format) return instance.format(node.$date.format);
  return instance.toISOString();
};

export const opDateAdd = (node: DateAddNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  notAheadOfTime(context);
  const value = evaluate(node.$dateAdd.date, context);
  const d = parseDate(value, node, '$dateAdd', 'date', node.$dateAdd.date, '$dateAdd');
  const moved = d.add(node.$dateAdd.amount, node.$dateAdd.unit);
  return isDateOnly(value) ? moved.format('YYYY-MM-DD') : moved.toISOString();
};

export const opDateDiff = (node: DateDiffNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  notAheadOfTime(context);
  const from = evaluate(node.$dateDiff.from, context);
  const to = evaluate(node.$dateDiff.to, context);
  const fromDate = parseDate(from, node, '$dateDiff', 'from', node.$dateDiff.from, '$dateDiff.from');
  const toDate = parseDate(to, node, '$dateDiff', 'to', node.$dateDiff.to, '$dateDiff.to');
  return toDate.diff(fromDate, node.$dateDiff.unit);
};
