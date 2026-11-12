// Node timer representation, independent of task/resource policy.
export const MAX_NATIVE_TIMEOUT_MS = 2 ** 31 - 1;
export class OperationFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'OperationFailure';
  }
}
export class RunControl extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RunControl';
  }
}
