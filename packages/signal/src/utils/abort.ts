import { SignalError, ErrorCode } from '../errors';

export type CallAbort = { signal: AbortSignal | undefined; release: () => void };

export const abortedSource = (...sources: ReadonlyArray<AbortSignal | undefined>): AbortSignal | undefined =>
  sources.find((source) => source?.aborted === true);

// One signal per call, released when the call ends: a provider SDK adds a listener to
// the signal it is handed and never takes it off, so a long-lived signal is never handed on.
export const abortForCall = (...sources: ReadonlyArray<AbortSignal | undefined>): CallAbort => {
  const given = sources.flatMap((source) => (source === undefined ? [] : [source]));
  if (given.length === 0) return { signal: undefined, release: () => {} };
  const controller = new AbortController();
  const already = abortedSource(...given);
  if (already) {
    controller.abort(already.reason);
    return { signal: controller.signal, release: () => {} };
  }
  const removals = given.map((source) => {
    const onAbort = (): void => controller.abort(source.reason);
    source.addEventListener('abort', onAbort, { once: true });
    return () => source.removeEventListener('abort', onAbort);
  });
  return { signal: controller.signal, release: () => removals.forEach((remove) => remove()) };
};

export const abortedError = (reason: unknown): SignalError =>
  new SignalError('The call was aborted', ErrorCode.PROVIDER_ERROR, { reason });

// What the call throws is passed on as it is, an abort included: the adapters already
// report an abort as E_PROVIDER_ERROR, with the provider's own message.
export const unlessAborted = async <R>(
  sources: ReadonlyArray<AbortSignal | undefined>,
  call: (signal: AbortSignal | undefined) => Promise<R>,
): Promise<R> => {
  const abort = abortForCall(...sources);
  try {
    if (abort.signal?.aborted) throw abortedError(abort.signal.reason);
    const value = await call(abort.signal);
    if (abort.signal?.aborted) throw abortedError(abort.signal.reason);
    return value;
  } finally {
    abort.release();
  }
};
