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
