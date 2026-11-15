import { SignalError, ErrorCode } from '../errors';

export const abortSignalOf = (...candidates: ReadonlyArray<AbortSignal | undefined>): AbortSignal | undefined => {
  const signals = candidates.flatMap((signal) => (signal === undefined ? [] : [signal]));
  return signals.length > 1 ? AbortSignal.any(signals) : signals[0];
};

export const abortedError = (signal: AbortSignal): SignalError =>
  new SignalError('The call was aborted', ErrorCode.PROVIDER_ERROR, { reason: signal.reason });

export const unlessAborted = async <R>(signal: AbortSignal | undefined, call: () => Promise<R>): Promise<R> => {
  if (signal?.aborted) throw abortedError(signal);
  let value: R;
  try {
    value = await call();
  } catch (error) {
    if (signal?.aborted) throw abortedError(signal);
    throw error;
  }
  if (signal?.aborted) throw abortedError(signal);
  return value;
};
