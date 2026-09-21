import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { z } from 'zod';
import { answerQuestions } from './lexical-scorer';

// ═══════════════════════════════════════════════════════════
// THE FAKE DECISION PROVIDER — a real listener speaking the System One wire.
//
// A listener, not an in-process stub, on purpose: the app reaches it through
// `@niscorp/signal`'s genuine `systemone` adapter, so the fetch, the bearer
// header, the body shape and signal's acceptance gate are all exercised on
// every pass of every check. Swap the base URL for TypeSafe's and nothing else
// in the app changes — which is only a true sentence if the fake is held to
// the same wire the real thing is.
//
//   POST {base}/systemone   Authorization: Bearer <anything>
//   { model, state, questions } → { model, answers, usage }
// ═══════════════════════════════════════════════════════════

const QuestionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('choice'), instructions: z.string(), criteria: z.record(z.string(), z.string()) }),
  z.object({ type: z.literal('score'), instructions: z.string(), criteria: z.array(z.string()).min(1) }),
  z.object({ type: z.literal('noul'), instructions: z.string(), criteria: z.object({ true: z.string(), false: z.string() }).optional() }),
]);

const RequestSchema = z.object({
  model: z.string(),
  state: z.unknown(),
  questions: z.record(z.string(), QuestionSchema),
});

export const FAKE_MODEL = 'encore-lexical-1';

export type FakeProviderConfig = {
  // 0 asks the OS for a free port — what every check does, so a dev server
  // already holding the default never fails a suite.
  port: number;
  // Held before answering, so the single-flight pacing can be FELT: at 0 the
  // fake answers inside a keystroke and the queue never forms.
  latencyMs: number;
  // A model with a middling opinion about everything (lexical-scorer.ts).
  noulFloor?: number;
};

export type FakeProvider = {
  baseUrl: string;
  port: number;
  // Mutable, so one booted world can be fast for most of a check and slow for
  // the part that has to watch a pass being out.
  latency: { ms: number };
  // Mutable for the same reason: a check turns the floor up for the scenes that
  // have to survive a calibrated model's guesses.
  middling: { floor: number };
  // How many TCP connections have been accepted — what proves a connection
  // was REUSED across an idle gap rather than re-opened.
  connections: () => number;
  // The last few request bodies, verbatim, oldest first — what a check reads to
  // prove what Jev was (and was NOT) handed: one sentence, and no history.
  seen: () => readonly string[];
  close: () => Promise<void>;
};

const readBody = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
};

const reply = (response: ServerResponse, status: number, body: unknown): void => {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
};

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

const KEPT_BODIES = 40;

const handle = async (request: IncomingMessage, response: ServerResponse, latency: { ms: number }, bodies: string[], middling: { floor: number }): Promise<void> => {
  const path = new URL(request.url ?? '/', 'http://fake.local').pathname;
  if (request.method !== 'POST' || !path.endsWith('/systemone')) return reply(response, 404, { error: 'not_found' });
  // Any bearer is accepted, but one must be presented: a caller that forgot
  // the header would work here and fail against the real provider.
  if (!/^Bearer \S+/.test(request.headers.authorization ?? '')) return reply(response, 401, { error: 'missing_bearer' });

  const text = await readBody(request);
  bodies.push(text);
  if (bodies.length > KEPT_BODIES) bodies.shift();
  const parsed = RequestSchema.safeParse(parseJson(text));
  if (!parsed.success) return reply(response, 400, { error: 'invalid_request', issues: parsed.error.issues.map((issue) => issue.message) });

  if (latency.ms > 0) await new Promise<void>((resolve) => setTimeout(resolve, latency.ms));

  reply(response, 200, {
    model: FAKE_MODEL,
    answers: answerQuestions(parsed.data.state, parsed.data.questions, { noulFloor: middling.floor }),
    // The usual four-bytes-a-token estimate, so the trace has a number of the
    // right size to show. A decision model emits no tokens.
    usage: { input_tokens: Math.ceil(Buffer.byteLength(text) / 4), output_tokens: 0 },
  });
};

const listen = (server: Server, port: number): Promise<number> =>
  new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject);
      const address = server.address();
      if (address === null || typeof address === 'string') reject(new Error('encore: the fake decision provider did not bind a port'));
      else resolve(address.port);
    });
  });

const isAddressInUse = (error: unknown): boolean => error instanceof Error && 'code' in error && error.code === 'EADDRINUSE';

export const startFakeProvider = async (config: FakeProviderConfig): Promise<FakeProvider> => {
  const latency = { ms: config.latencyMs };
  const middling = { floor: config.noulFloor ?? 0 };
  let accepted = 0;
  const bodies: string[] = [];
  const build = (): Server => {
    const listener = createServer((request, response) => {
      handle(request, response, latency, bodies, middling).catch((error: unknown) => {
        console.error('[encore/decider] the fake provider failed a request:', error);
        if (!response.headersSent) reply(response, 500, { error: 'fake_provider_failed' });
      });
    });
    // LIKE THE REAL ONE: no `Keep-Alive: timeout=…` hint, and no hurry to hang
    // up. Node's default would advertise five seconds, the client would honour
    // it, and the fake would hide exactly the behaviour keep-warm.ts exists
    // for — whether the CLIENT holds an idle connection open.
    listener.keepAliveTimeout = 0;
    listener.on('connection', () => {
      accepted += 1;
    });
    return listener;
  };

  let server = build();
  let port: number;
  try {
    port = await listen(server, config.port);
  } catch (error) {
    // The configured port is a convenience for curl, never an address the app
    // depends on — it reaches the fake by whatever port was bound. So a port
    // already held (a dev server's hot re-boot overlapping its predecessor)
    // falls back to a free one instead of taking the boot down.
    if (!isAddressInUse(error)) throw error;
    server = build();
    port = await listen(server, 0);
  }

  const bound = server;
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    port,
    latency,
    middling,
    connections: () => accepted,
    seen: () => bodies,
    close: () =>
      new Promise<void>((resolve) => {
        bound.closeAllConnections();
        bound.close(() => resolve());
      }),
  };
};
