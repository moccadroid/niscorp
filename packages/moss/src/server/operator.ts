import { createHash, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { NiscRuntime } from '../runtime';
import type { Env } from './moss-server';

// ═══════════════════════════════════════════════════════════════
// THE OPERATOR PREFIX — keyed, principal-less, and 404 without: a stranger
// who finds the path gets the same answer as a stranger with a wrong key,
// which is nothing. The server has no operator route of its own; a feature
// mounts its routes here, and the prefix is mounted once every feature has.
// ═══════════════════════════════════════════════════════════════

// Constant-time credential comparison. Both sides are hashed to a fixed 32-byte
// width first, so the compare never branches on length: a short guess is refused
// in the same time as a correct-length one (a bare length check would leak the
// key's length), and `timingSafeEqual` — which throws on a length mismatch — is
// always handed two equal-width digests. The timing signal a REMOTE attacker
// could read here is nanoseconds under microseconds of network jitter and is not
// the point; D6 co-locates add-on containers on a shared network, and the least
// -trusted code in the deployment facing far less jitter is.
export const secretsEqual = (a: string, b: string): boolean =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

// THE TWO GATES GUARDING THE OPERATOR PREFIX, installed in the order they must
// run. Registration order IS the security property: Hono composes matched
// handlers in the order they were added, so the app's gate has to be added
// before moss's key check to run before it, and both before the routes to wrap
// them. Without this, an app that mounted its own `/operator/*` middleware got a
// gate that ran AFTER moss's and, on moss's own routes, never — moss answered
// every refusal and the app's gate was unreachable on the one path that matters.
//
// The app's gate (if any) runs first: returning a Response refuses; calling
// `next()` and returning falls through to moss's key check. Either way moss's
// own check still runs on every path the gate lets through, so the seam can only
// HARDEN the prefix — add a second lock, never remove moss's. Awaiting `next()`
// lets the gate observe the OUTCOME (moss's own 404, an approval's 422), which
// is what makes auditing the consequential acts here honest rather than a log of
// attempts.
export const guardOperator = (operator: Hono<Env>, opts: { key: string; gate?: NiscRuntime['operatorGate'] }): void => {
  const gate = opts.gate;
  // The context is typed here because Hono leaves what a route was handed as
  // `any`, and it is handed on to the app's gate.
  if (gate !== undefined) operator.use('*', (c: Context<Env>, next) => Promise.resolve(gate(c, next)));
  operator.use('*', async (c, next) => {
    const presented = c.req.header('x-operator-key') ?? '';
    if (opts.key === '' || !secretsEqual(presented, opts.key)) return c.json({ message: 'Not found.' }, 404);
    return next();
  });
};

// The prefix, with its two gates on it and no route yet: the constant-time key
// check, and the app's own gate over the whole prefix if it supplied one
// (`runtime.operatorGate`).
export const operatorPrefix = (runtime: Pick<NiscRuntime, 'operatorKey' | 'operatorGate'>): Hono<Env> => {
  const operator = new Hono<Env>();
  guardOperator(operator, { key: runtime.operatorKey ?? '', gate: runtime.operatorGate });
  return operator;
};
