import type { PgPool } from '@niscorp/vex';
import { emitterOf, spanClock } from '../runtime';
import type { Telemetry } from '../runtime';
import { WhereItIsSchema } from './registry';

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
//   field in the envelope; see assert.ts).
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
  pool: PgPool;
  // The app's install answer for this principal's tenant — undefined means
  // the app has no install seam, which admits (the proxy's rule, mirrored).
  installedFor: (principal: string) => Promise<readonly string[] | undefined>;
  // The same scope values the resolver gives vex for `$scope`; `init.scope`
  // merges OVER them — extras the deployment explicitly vouches for.
  scopeValuesFor: (principal: string) => Promise<Record<string, unknown>>;
  mint: (claims: { integration: string; principal: string; scope: Record<string, unknown> }) => string;
  fetchImpl?: typeof fetch;
  // The deployment's telemetry sink, if any — one `integration.call` span per
  // outbound call, naming the add-on, the path, and the answer's status. The
  // operator surface's ad-hoc `watchCalls` tap is the proof this seam is the
  // right one; this generalises it.
  telemetry?: Telemetry;
}): CallIntegration => {
  const fetchImpl = deps.fetchImpl ?? fetch;
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

    const row = await deps.pool.query('SELECT url, status FROM integrations WHERE id = $1', [id]);
    const found = WhereItIsSchema.optional().parse(row.rows[0]);
    if (found === undefined) {
      done('refused');
      throw new Error(`moss: callIntegration("${id}"): no such integration.`);
    }
    if (found.status !== 'approved') {
      done('refused');
      throw new Error(`moss: callIntegration("${id}"): not approved (status "${found.status}").`);
    }
    const installed = await deps.installedFor(init.principal);
    if (installed !== undefined && !installed.includes(id)) {
      done('refused');
      throw new Error(`moss: callIntegration("${id}"): not installed for "${init.principal}".`);
    }
    const scope = { ...(await deps.scopeValuesFor(init.principal)), ...(init.scope ?? {}) };
    const target = `${found.url.replace(/\/$/, '')}/${path.replace(/^\/+/, '')}`;
    let response: Response;
    try {
      response = await fetchImpl(target, {
        method: init.method ?? 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${deps.mint({ integration: id, principal: init.principal, scope })}`,
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      });
    } catch (err) {
      done('error');
      throw err;
    }
    done(response.ok ? 'ok' : 'error', response.status);
    return response;
  };
};
