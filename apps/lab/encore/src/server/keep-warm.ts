import { subscribe } from 'node:diagnostics_channel';
import { Socket } from 'node:net';
import { Agent, setGlobalDispatcher } from 'undici';
import { z } from 'zod';

// KEEP THE CONNECTION WARM.
//
// Measured from this machine against the real decision provider: their server
// answers a full 32-question pass in 66–140 ms, a round trip is ~220 ms, and a
// TLS handshake is another ~230 ms on top of a fresh TCP one. So a pass on a
// REUSED connection is ~300 ms and on a fresh one 750–1000 ms — and Node's
// built-in fetch drops an idle connection after about four seconds. Somebody
// who pauses to think, which is everybody, paid a new handshake on nearly
// every pass that followed. The trace had been showing it as a 800 ms `decide`
// lane and it looked like the model.
//
// The fix belongs to the ENVIRONMENT, not to signal: npm undici's global
// dispatcher is the one Node's built-in `fetch` uses (verified here — two
// fetches five seconds apart to a server that sends no keep-alive hint open
// two sockets on the default dispatcher and one on this), so signal's adapters
// and the Groq SDK both inherit it without knowing.
//
// `connections: 2` — one for the pass, one for a pre-warm or a text-model run
// to the same origin — rather than the default unlimited: a second concurrent
// request to a busy origin would otherwise open a second, cold socket.

const KEEP_ALIVE_MS = 60_000;
const KEEP_ALIVE_MAX_MS = 600_000;

let isInstalled = false;
let connects = 0;

// IS THERE A SOCKET OPEN TO THAT ORIGIN, RIGHT NOW? Counted, not guessed. The
// first version skipped a warm-up whenever the connection had been used in the
// last twenty seconds — which assumes OUR sixty-second hold is the one that
// matters. The far end has a say too: a provider that hangs up an idle socket
// after ten seconds leaves a connection that is "fresh" by the clock and gone in
// fact, and the first pass after a page load paid the handshake the warm-up had
// declined to (seen live: `connection new`, ~900 ms). A socket's own `close` is
// the truth, whoever closed it.
const open = new Map<string, number>();

const Connected = z.object({ connectParams: z.object({ hostname: z.string(), protocol: z.string().optional(), port: z.union([z.string(), z.number()]).optional() }).loose(), socket: z.instanceof(Socket) }).loose();

// A URL with no port means the protocol's own, on both sides of the comparison.
const originKey = (hostname: string, protocol: string | undefined, port: string | number | undefined): string => `${hostname}:${port === undefined || String(port) === '' ? (protocol === 'https:' ? '443' : '80') : String(port)}`;

export const installWarmDispatcher = (): void => {
  if (isInstalled) return;
  isInstalled = true;
  setGlobalDispatcher(new Agent({ keepAliveTimeout: KEEP_ALIVE_MS, keepAliveMaxTimeout: KEEP_ALIVE_MAX_MS, connections: 2 }));
  // undici publishes every NEW connection on a diagnostics channel. Counting
  // them is how a pass knows, for free, whether it rode a warm socket.
  subscribe('undici:client:connected', (message) => {
    connects += 1;
    const connected = Connected.safeParse(message);
    if (!connected.success) return;
    const key = originKey(connected.data.connectParams.hostname, connected.data.connectParams.protocol, connected.data.connectParams.port);
    open.set(key, (open.get(key) ?? 0) + 1);
    connected.data.socket.once('close', () => open.set(key, Math.max(0, (open.get(key) ?? 1) - 1)));
  });
};

// Sockets open to one origin at this moment. `port` as the URL spells it; an
// https URL with none is 443.
export const openConnectionsTo = (baseUrl: string): number => {
  const url = new URL(baseUrl);
  return open.get(originKey(url.hostname, url.protocol, url.port)) ?? 0;
};

// How many connections have been opened since boot. A pass reads it before and
// after its `decide` lane: unchanged means the socket was reused.
export const connectionsOpened = (): number => connects;
