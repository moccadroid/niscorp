import type { FetchFn } from '@niscorp/nova';
import { isDevtoolsEnabled } from './flag';
import { devtoolsLog, notifyEntry } from './log';

// Wraps the fetch injected into the shell so every endpoint call lands in the
// devtools timeline. The response body is captured LAZILY — we tee json()/text()
// at consumption time instead of reading the body ourselves, so single-use real
// `window.fetch` responses are never double-consumed and un-consumed bodies are
// simply not logged. Off-flag calls pass straight through.
const parse = (body: string | undefined): unknown => {
  if (body === undefined) return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
};

export const traceFetch = (inner: FetchFn): FetchFn => async (url, init) => {
  if (!isDevtoolsEnabled()) return inner(url, init);

  const started = performance.now();
  const id = devtoolsLog.push({
    kind: 'fetch',
    t: Date.now(),
    url,
    method: (init?.method ?? 'GET').toUpperCase(),
    requestBody: parse(init?.body),
  });

  try {
    const res = await inner(url, init);
    devtoolsLog.patch(id, { status: res.status, ok: res.ok, ms: Math.round(performance.now() - started) });
    notifyEntry();
    // Rebuild the shape explicitly — a spread would drop `ok`/`status` on real
    // window.fetch Responses (they're prototype getters, not own properties).
    return {
      ok: res.ok,
      status: res.status,
      json: () =>
        res.json().then((body) => {
          devtoolsLog.patch(id, { responseBody: body });
          notifyEntry();
          return body;
        }),
      text: () =>
        res.text().then((body) => {
          devtoolsLog.patch(id, { responseBody: parse(body) });
          notifyEntry();
          return body;
        }),
    };
  } catch (err) {
    devtoolsLog.patch(id, { error: String(err), ms: Math.round(performance.now() - started) });
    notifyEntry();
    throw err;
  }
};
