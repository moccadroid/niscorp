import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';

import type { JsonValue, EvalContext, EvaluateFn } from '../types';
import type { DateNode, DateAddNode, DateDiffNode } from '../schemas';
import { PrismError, ErrorCode } from '../errors';

dayjs.extend(utc);

const parseDate = (value: JsonValue, op: string): dayjs.Dayjs => {
  if (typeof value !== 'string' && typeof value !== 'number')
    throw new PrismError(`Expected string or number for ${op}`, ErrorCode.TYPE, { op });
  const d = dayjs(value);
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
  return d.add(node.$dateAdd.amount, node.$dateAdd.unit).toISOString();
};

export const opDateDiff = (node: DateDiffNode, context: EvalContext, evaluate: EvaluateFn): JsonValue => {
  const from = evaluate(node.$dateDiff.from, context);
  const to = evaluate(node.$dateDiff.to, context);
  const fromDate = parseDate(from, '$dateDiff.from');
  const toDate = parseDate(to, '$dateDiff.to');
  return toDate.diff(fromDate, node.$dateDiff.unit);
};
