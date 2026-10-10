// A SERVICE THAT NEVER ANSWERS: a fetch whose call is ended by the signal it is
// made with and by nothing else, which is how a real one behaves. It remembers
// the signal of each call. Made with none, the call fails at once and says so:
// a test must not wait on a call that nothing can end.
export const neverAnswers = (): { fetch: typeof fetch; signals: (AbortSignal | undefined)[] } => {
  const signals: (AbortSignal | undefined)[] = [];
  const unanswered = (_input: string | URL | Request, init?: RequestInit): Promise<Response> =>
    new Promise((_resolve, reject) => {
      const signal = init?.signal ?? undefined;
      signals.push(signal);
      if (signal === undefined) reject(new Error('the call was made with no signal: nothing would ever end it'));
      else if (signal.aborted) reject(signal.reason);
      else signal.addEventListener('abort', () => reject(signal.reason));
    });
  return { fetch: unanswered, signals };
};
