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

type Place = { node: object; op: string; field: string; written: unknown; contextOp: string };

const parseDate = (value: JsonValue, { node, op, field, written, contextOp }: Place): dayjs.Dayjs => {
  if (typeof value !== 'string' && typeof value !== 'number')
    return refuseType({ node, op, field, needs: 'a date, as text or a number', got: value, written, contextOp });
  const d = isDateOnly(value) ? dayjs.utc(value) : dayjs(value);
  if (!d.isValid())
    return failAt(`Invalid date for ${contextOp}: ${clip(String(value), 60)}`, ErrorCode.DATE_INVALID, { op: contextOp }, { node, op, field, form: false });
  return d;
};

export const opDate = (node: DateNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$date.value, context);
  const d = parseDate(value, { node, op: '$date', field: 'value', written: node.$date.value, contextOp: '$date' });
  const instance = node.$date.utc ? d.utc() : d;
  if (node.$date.format) return instance.format(node.$date.format);
  return instance.toISOString();
};

export const opDateAdd = (node: DateAddNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const value = evaluate(node.$dateAdd.date, context);
  const d = parseDate(value, { node, op: '$dateAdd', field: 'date', written: node.$dateAdd.date, contextOp: '$dateAdd' });
  const moved = d.add(node.$dateAdd.amount, node.$dateAdd.unit);
  return isDateOnly(value) ? moved.format('YYYY-MM-DD') : moved.toISOString();
};

export const opDateDiff = (node: DateDiffNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const from = evaluate(node.$dateDiff.from, context);
  const to = evaluate(node.$dateDiff.to, context);
  const fromDate = parseDate(from, { node, op: '$dateDiff', field: 'from', written: node.$dateDiff.from, contextOp: '$dateDiff.from' });
  const toDate = parseDate(to, { node, op: '$dateDiff', field: 'to', written: node.$dateDiff.to, contextOp: '$dateDiff.to' });
  return toDate.diff(fromDate, node.$dateDiff.unit);
};
