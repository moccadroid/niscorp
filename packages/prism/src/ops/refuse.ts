import type { JsonValue } from '../types';
import { ErrorCode, clip, describeValue, failAt } from '../errors';
import { isPlainObject } from '../schemas/guards';

export const writtenNote = (written: unknown): string =>
  isPlainObject(written)
    ? ` That object was written in the program as ${clip(JSON.stringify(written), 60)}, and an object without a "$" key builds an object; put the node itself there.`
    : '';

type TypeRefusal = {
  node: object;
  op: string;
  field?: string;
  needs: string;
  got: JsonValue;
  written: unknown;
  contextOp?: string;
};

export const TEXT_LIKE = 'text, a number, true, false or null';

export const isTextLike = (value: JsonValue): boolean => value === null || typeof value !== 'object';

export const refuseType = ({ node, op, field, needs, got, written, contextOp }: TypeRefusal): never =>
  failAt(
    `${field === undefined ? op : `${op}.${field}`} needs ${needs}, but got ${describeValue(got)}.${writtenNote(written)}`,
    ErrorCode.TYPE,
    { op: contextOp ?? op },
    { node, op, ...(field === undefined ? {} : { field }), form: true },
  );
