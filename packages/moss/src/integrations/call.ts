import { emitterOf, spanClock } from '../runtime';
import type { Telemetry } from '../runtime';
import type { Forwarder } from './forward';

// ── the outbound act ─────────────────────────────────────────
//
// Call an installed integration when nobody is driving — the outbound mirror
// of `executeAs`. Auth, the outbox sweep, an erase propagating across every
// ledger: acts the DEPLOYMENT performs, with no request in flight and no
// principal mid-click. The proxy cannot carry them (it needs both), and
// handing an app the signer would hand it the two gates below to re-implement
// wrongly once — so the narrow verb is the surface.
//
// Two deliberate differences from the proxy:
//
//   NOT GATED BY REACH. Reach fences what a screen may cause a browser to
//   reach — a fence around actions — and a lifecycle verb is not an action
//   and has no screen. Reach is derived from declared endpoints, so it could
//   never admit an undeclared verb anyway; the integration gates the call
//   itself, on the verified claims (principal and scope — there is no other
//   field in the envelope; see ./credentials.ts).
//
//   THE PRINCIPAL IS THE PERSON WHO ACTED, so the owner who pressed erase is
//   who the other ledger sees. A machinery principal would make every
//   integration's owner check pass or fail on a name that belongs to no one.
//
// The two gates that stay: approved, and installed for this principal's
// tenant. Refusals THROW with a sentence — the caller is the deployment's own
// orchestrator, and a state error is something it must see, not a status to
// mistake for the integration's answer. What the integration answers comes
// back as the Response, whatever it is; an unreachable service rejects, and a
// sweep's whole job is to retry.
//
// One ordering the gate forces on the app: an erase retried after the
// integration was UNINSTALLED refuses forever — rightly, no credential for an
// uninstalled integration — so an orchestrator sequences erasure ahead of
// uninstall's row retirement, or drains pending erases first.

export type CallIntegration = (
  id: string,
  path: string,
  init: { principal: string; method?: string; body?: unknown; scope?: Record<string, unknown> },
) => Promise<Response>;

export const callIntegrationWith = (deps: {
  // The one way out (./forward.ts): the two gates, the scope values with
  // `init.scope` laid over them, and the assertion are its to do.
  forward: Forwarder;
  // The deployment's telemetry sink, if any — one `integration.call` span per
  // outbound call, naming the add-on, the path, and the answer's status. The
  // operator surface's ad-hoc `watchCalls` tap is the proof this seam is the
  // right one; this generalises it.
  telemetry?: Telemetry;
}): CallIntegration => {
  const emit = emitterOf(deps.telemetry);
  return async (id, path, init) => {
    const clock = emit === undefined ? undefined : spanClock();
    // A refusal or answer, as one span. `httpStatus` is present only when the
    // add-on actually answered; a guard refusal and an unreachable service both
    // carry none, distinguished by `status`.
    const done = (status: 'ok' | 'error' | 'refused', httpStatus?: number): void => {
      if (emit === undefined || clock === undefined) return;
      emit({
        name: 'integration.call',
        startUnixNano: clock.startUnixNano,
        endUnixNano: clock.endUnixNano(),
        status,
        attributes: { addon: id, path, ...(httpStatus !== undefined ? { httpStatus } : {}) },
      });
    };

    const ended = await deps.forward({
      integration: id,
      principal: init.principal,
      ...(init.scope === undefined ? {} : { scope: init.scope }),
      path: path.replace(/^\/+/, ''),
      request: (assertion) => ({
        method: init.method ?? 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${assertion}` },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      }),
    });
    if (ended.kind === 'unreachable') {
      done('error');
      throw ended.error;
    }
    if (ended.kind === 'refused') {
      done('refused');
      const why =
        ended.why === 'unapproved'
          ? `not approved (status "${ended.status}").`
          : ended.why === 'uninstalled'
            ? `not installed for "${init.principal}".`
            : 'no such integration.';
      throw new Error(`moss: callIntegration("${id}"): ${why}`);
    }
    done(ended.response.ok ? 'ok' : 'error', ended.response.status);
    return ended.response;
  };
};
