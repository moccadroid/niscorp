import { createShell, ActionDefinitionSchema, auditAction, type PublicActionRuntime } from '@niscorp/nova';
import { flattenSchemaIssues } from '@niscorp/cortex';
import { evaluate } from '@niscorp/prism';
import { buildRegistry } from '../../ui';
import { vexFetch } from '../../vex/http';
import { todayStr } from '../../vex/runtime';
import { identity } from '../../auth';
import { catalogEntries } from '../catalog';
import { knownChannels } from '../knowledge';

// ═══════════════════════════════════════════════════════════
// The one verification primitive: schema parse → static wiring audit → mount
// and look. This HARNESS is where action validation is robust — the agent's
// validator, the run_action self-test tool, and any dev check all call it;
// none carry bespoke checks of their own.
//
// The audit (nova's auditAction) cross-references the definition against
// itself and the catalog: bindings ↔ data defaults, refs ↔ triggers, calls ↔
// endpoints, targets ↔ data, pushes ↔ catalog input contracts — every way a
// definition can mount politely and still be broken at click time. Audit
// failures return WITHOUT mounting: they are deterministic and precise.
//
// `runAction` then mounts the candidate in a THROWAWAY shell — same
// registry / fetch / transform as the live app, but its own buses, never
// attached to React. It loads the action's data (proving its endpoints),
// renders it once (so a broken binding/component surfaces via onError), and
// reports what happened. The full data is returned; the probe TOOL samples
// it before the model ever sees it.
// ═══════════════════════════════════════════════════════════

export type RunResult = {
  ok: boolean;
  data: Record<string, unknown>;
  issues: string[];
  // What each endpoint's target held AFTER mount — the diff between "what
  // should be there" (a target per endpoint) and what actually arrived
  // ("12 rows" / "object" / "EMPTY"). Feedback for models and humans both.
  loaded: Record<string, string>;
};

// The same endpoint transform the live shell injects (see nova/shell/shell.ts):
// fold the signed-in user + the app's "today" into the source so read prisms
// resolve `$.userId` / `$.today`. Endpoint-only — never touches action data.
const transform = (config: unknown, source: unknown): unknown =>
  evaluate(
    config as Parameters<typeof evaluate>[0],
    (source !== null && typeof source === 'object' && !Array.isArray(source)
      ? { ...(source as Record<string, unknown>), userId: identity()?.userId ?? 'anonymous', today: todayStr() }
      : source) as Parameters<typeof evaluate>[1],
  );

// `shell.push` fires mount asynchronously and forgets it, so the data isn't loaded
// the instant push returns — we must wait for the instance to finish mounting
// (status → active) or die (unmounted) before reading. Bounded so a hung endpoint
// can't hang the probe (and leak the shell); on timeout the caller records an issue.
const awaitMount = (rt: PublicActionRuntime, timeoutMs = 60_000): Promise<boolean> =>
  new Promise((resolve) => {
    const s = rt.instance.status;
    if (s === 'active' || s === 'unmounted') return resolve(true);
    let off = (): void => {};
    const timer = setTimeout(() => {
      off();
      resolve(false);
    }, timeoutMs);
    off = rt.onStatusChange((next) => {
      if (next === 'active' || next === 'unmounted') {
        clearTimeout(timer);
        off();
        resolve(true);
      }
    });
  });

// Post-mount load report: for every endpoint with a `target`, what
// arrived — DIFFED against what the build's queries PROVED. No
// heuristics about what "healthy" looks like: empty is legal exactly
// when the proof was empty; a proof that returned rows while the
// mounted replay loaded nothing is a named discrepancy (the context
// bindings differ from the proof).
type QueryProof = { count: number; contextKeys: string[] };

type Endpointish = { target?: string; request?: unknown };

const requestFingerprint = (request: unknown): string | undefined => {
  if (request === null || typeof request !== 'object') return undefined;
  const fp = (request as Record<string, unknown>)['fingerprint'];
  return typeof fp === 'string' ? fp : undefined;
};

const requestContextKeys = (request: unknown): string[] => {
  if (request === null || typeof request !== 'object') return [];
  const context = (request as Record<string, unknown>)['context'];
  return context !== null && typeof context === 'object' ? Object.keys(context) : [];
};

const loadReport = (
  definition: { endpoints?: Record<string, Endpointish> },
  data: Record<string, unknown>,
  proofs?: ReadonlyMap<string, QueryProof>,
): { loaded: Record<string, string>; issues: string[] } => {
  const loaded: Record<string, string> = {};
  const issues: string[] = [];
  for (const [name, endpoint] of Object.entries(definition.endpoints ?? {})) {
    const target = endpoint.target;
    if (typeof target !== 'string' || target.length === 0) continue;
    const value = data[target];
    const empty =
      value === undefined || value === null || (Array.isArray(value) && value.length === 0);
    loaded[name] =
      `${target}: ` +
      (empty
        ? 'EMPTY'
        : Array.isArray(value)
          ? `${value.length} rows`
          : typeof value === 'object'
            ? 'object'
            : JSON.stringify(value));
    if (!empty) continue;
    const fingerprint = requestFingerprint(endpoint.request);
    const proof = fingerprint !== undefined ? proofs?.get(fingerprint) : undefined;
    if (proof && proof.count > 0) {
      issues.push(
        `endpoint '${name}' loaded EMPTY but its query proof returned ${proof.count} row(s) — ` +
          `the query binds context keys [${proof.contextKeys.join(', ')}], the endpoint sends [${requestContextKeys(endpoint.request).join(', ')}]`,
      );
    }
  }
  return { loaded, issues };
};

export const runAction = async (
  def: unknown,
  input?: Record<string, unknown>,
  proofs?: ReadonlyMap<string, QueryProof>,
): Promise<RunResult> => {
  const parsed = ActionDefinitionSchema.safeParse(def);
  if (!parsed.success) {
    return {
      ok: false,
      data: {},
      loaded: {},
      // Flattened union issues: zod says "Invalid input" at a union node
      // (steps, layout nodes); the flattener names the branch the value
      // meant, so the model reads "steps.0.call: expected string" instead.
      issues: flattenSchemaIssues(parsed.error.issues).map(
        (i) => `${i.path.join('.') || '(root)'}: ${i.message}`,
      ),
    };
  }

  const audit = auditAction(parsed.data, {
    // LIVE catalog: hand-authored screens + everything built this session.
    catalog: catalogEntries().map((entry) => ({ id: entry.id, input: entry.input })),
    // LIVE channel vocabulary, derived from the registered definitions.
    channels: knownChannels(),
  });
  if (!audit.ok) return { ok: false, data: {}, loaded: {}, issues: audit.issues };

  const issues: string[] = [];
  // A failed endpoint call must be TALKED ABOUT, not just leave its target
  // empty — vex's error body says exactly what went wrong (a cache_miss
  // names the unknown fingerprint). Wrap the fetch and keep the bodies.
  const probeFetch: typeof vexFetch = async (url, init) => {
    const res = await vexFetch(url, init);
    if (!res.ok) {
      try {
        const text = (await res.text()).slice(0, 300);
        // Vex's advice ("pass intent + shape") is for API callers; the
        // action available HERE is the query tool. Say so.
        const advice = text.includes('cache_miss')
          ? ' Get a valid fingerprint by calling `query`; put THAT fingerprint in the endpoint request.'
          : '';
        issues.push(`endpoint call failed (${res.status}): ${text}${advice}`);
      } catch {
        issues.push(`endpoint call failed (${res.status})`);
      }
    }
    return res;
  };
  const shell = createShell({
    canvases: [{ id: 'main' }],
    registry: buildRegistry(),
    // Only the candidate is registered. Navigation targets (a row click opening
    // another action) resolve at INTERACTION time, which a mount-only probe never
    // triggers, so the existing catalog isn't needed here.
    actions: { [parsed.data.id]: parsed.data },
    functions: {},
    transform,
    fetch: probeFetch,
    onError: (e) => issues.push(`${e.code}: ${e.message}`),
  });

  try {
    const id = shell.push('main', parsed.data.id, input);
    const rt = shell.getRuntime(id);
    if (rt === undefined) return { ok: false, data: {}, loaded: {}, issues: ['runtime was not created'] };
    const settled = await awaitMount(rt);
    if (!settled) issues.push('mount timed out: an endpoint did not settle');
    rt.render(); // surfaces any render error through onError → issues
    const data = rt.getData();
    const report = loadReport(parsed.data, data, proofs);
    issues.push(...report.issues);
    return { ok: issues.length === 0, data, issues, loaded: report.loaded };
  } finally {
    shell.dispose();
  }
};
