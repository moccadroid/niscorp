export const ErrorCode = {
  SCHEMA: 'E_SCHEMA',
  MISSING_PATH: 'E_MISSING_PATH',
  TYPE: 'E_TYPE',
  DIVISION_BY_ZERO: 'E_DIVISION_BY_ZERO',
  DATE_INVALID: 'E_DATE_INVALID',
  VAR_NOT_FOUND: 'E_VAR_NOT_FOUND',
  NODE_SHAPE: 'E_NODE_SHAPE',
  ASSERT: 'E_ASSERT',
  BUDGET: 'E_BUDGET',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export type PrismErrorContext = {
  op?: string;
  path?: string;
  details?: Record<string, unknown>;
};

export class PrismError extends Error {
  readonly code: ErrorCode;
  readonly context: PrismErrorContext | undefined;

  constructor(message: string, code: ErrorCode, context?: PrismErrorContext) {
    super(message);
    this.name = 'PrismError';
    this.code = code;
    this.context = context;
  }
}

export type Origin = {
  node: object;
  op?: string;
  field?: string;
  form: boolean;
  detail?: () => string;
};

const origins = new WeakMap<PrismError, Origin>();

export const takeOrigin = (error: PrismError): Origin | undefined => {
  const origin = origins.get(error);
  origins.delete(error);
  return origin;
};

export const failAt = (message: string, code: ErrorCode, context: PrismErrorContext, origin: Origin): never => {
  const error = new PrismError(message, code, context);
  origins.set(error, origin);
  throw error;
};

export const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max)}…` : text);

export const describeValue = (value: unknown): string => {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return `text ${clip(JSON.stringify(value), 60)}`;
  if (typeof value === 'number' || typeof value === 'boolean') return `the ${typeof value} ${String(value)}`;
  const json = clip(JSON.stringify(value) ?? String(value), 80);
  if (Array.isArray(value)) return `a list of ${value.length} item${value.length === 1 ? '' : 's'}: ${json}`;
  return `an object: ${json}`;
};
