import { createShell, ActionDefinitionSchema, auditAction, type PublicActionRuntime } from '@niscorp/nova';
import { flattenSchemaIssues } from '@niscorp/cortex';
import { evaluate } from '@niscorp/prism';
import { buildRegistry } from '@relay/ui';
import { handleQuery, handleDiscovery } from '@niscorp/vex';
import { resourceEntities } from '@relay/app/vex/resources';
import type { RayContext } from '../engine';
import { todayStr } from '@relay/lib/date';
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
const transformAmbient = (userId: string) => (config: unknown, source: unknown): unknown =>
  evaluate(
    config as Parameters<typeof evaluate>[0],
    (source !== null && typeof source === 'object' && !Array.isArray(source)
      ? { ...(source as Record<string, unknown>), userId, today: todayStr() }
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
  ray: RayContext,
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

  // EVERY GENERATED FINGERPRINT IN THE DEFINITION MUST HAVE BEEN PROVEN IN
  // THIS BUILD. Mounting exercises only the DEFAULT state — a fingerprint
  // behind the other branch of a $case (a dropdown's July while June is the
  // default) is never replayed by the probe, so a mistyped or invented one
  // ships silently and the screen dies at click time. The check is static and
  // total: any `fp_…` literal anywhere in the definition that this build's
  // query tool never returned is a named failure, not a latent 404. Seeded
  // names (`deals/list`) are the durable API surface and pass freely.
  if (proofs !== undefined) {
    const serialized = JSON.stringify(parsed.data);
    const embedded = new Set(
      [...serialized.matchAll(/"(fp_[0-9a-f]{16})"/g)].map((m) => m[1] ?? ''),
    );
    const unproven = [...embedded].filter((fp) => !proofs.has(fp));
    if (unproven.length > 0) {
      return {
        ok: false,
        data: {},
        loaded: {},
        issues: unproven.map(
          (fp) =>
            `fingerprint "${fp}" was never proven in this build — replay it with the query tool and copy the fingerprint from the result, character for character`,
        ),
      };
    }
    // THE HOLLOW SHIP. A run that proved data and then wired NONE of it can
    // pass every other check: the schema allows a definition with no
    // endpoints, the audit has nothing to cross-reference, and a mount with
    // nothing to load fails nothing. Seen in the wild: five clean queries,
    // then a Stack with one empty Text, shipped with zero retries. If this
    // build proved data, the definition must load some of it.
    if (proofs.size > 0) {
      const used = [...proofs.keys()].some((fp) => serialized.includes(`"${fp}"`));
      if (!used) {
        return {
          ok: false,
          data: {},
          loaded: {},
          issues: [
            'this build proved data with `query` but the definition loads NONE of it — no endpoint replays any proven fingerprint. Wire the data you proved (endpoint request { "fingerprint": ... }, called from lifecycle.mount) or the screen shows nothing.',
          ],
        };
      }
    }
  }

  const audit = auditAction(parsed.data, {
    // LIVE catalog: hand-authored screens + everything built this session.
    catalog: catalogEntries().map((entry) => ({ id: entry.id, input: entry.input })),
    // LIVE channel vocabulary, derived from the registered definitions.
    channels: knownChannels(),
  });
  // PRISM GRAMMAR DOES NOT RENDER. Layout props are resolved by the shell's
  // binding resolver, whose whole vocabulary is string paths ("$.deals"),
  // moustache templates, and the render directives below. A prism node in a
  // prop — rows: {"$ref": "$.deals"} — is walked as a PLAIN OBJECT: the Table
  // receives { $ref: [rows] } instead of the rows, Array.isArray fails, and
  // the screen renders its empty state OVER loaded data with no error
  // anywhere. Seen live: a header reading "6 deals" beside an empty table.
  // Prism belongs to endpoint request/response ONLY; in layout it is refused
  // here, statically, with the rewrite spelled out.
  const RENDER_DIRECTIVES = new Set(['$if', '$then', '$else', '$eq', '$exists', '$at', '$prism']);
  const prismInLayout: string[] = [];
  const scanLayout = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      node.forEach((child, i) => scanLayout(child, `${path}.${i}`));
      return;
    }
    if (node === null || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    const opKeys = Object.keys(record).filter((k) => k.startsWith('$') && !RENDER_DIRECTIVES.has(k));
    if (opKeys.length > 0) {
      const inner = record[opKeys[0] ?? ''];
      const hint = typeof inner === 'string' ? ` — write the string path ${JSON.stringify(inner)} instead` : '';
      prismInLayout.push(
        `${path} uses ${opKeys.join('/')} — prism nodes do not resolve in layout; bind with a string path ("$.key") or {{ }}${hint}`,
      );
      return;
    }
    for (const [key, value] of Object.entries(record)) scanLayout(value, `${path}.${key}`);
  };
  scanLayout(parsed.data.layout, 'layout');
  if (prismInLayout.length > 0) return { ok: false, data: {}, loaded: {}, issues: prismInLayout };

  // OPTION VALUES TRAVEL THROUGH THE DOM. A <select> option's value is a
  // string, full stop — relay's Select coerces anything else to '' — so an
  // object value reaches the trigger as an EMPTY string, the bound key goes
  // blank, and the screen dies with no error (observed live: a month dropdown
  // whose {start,end} values all became "", loading stuck on a skeleton).
  const badOptions: string[] = [];
  const scanOptions = (node: unknown, path: string): void => {
    if (Array.isArray(node)) { node.forEach((c, i) => scanOptions(c, `${path}.${i}`)); return; }
    if (node === null || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    const options = record['options'];
    if (Array.isArray(options)) {
      options.forEach((o, i) => {
        const v = (o as Record<string, unknown> | null)?.['value'];
        if (v !== null && v !== undefined && typeof v !== 'string' && typeof v !== 'number') {
          badOptions.push(`${path}.options.${i}.value is an ${Array.isArray(v) ? 'array' : 'object'} — option values must be plain strings (the DOM coerces them to "" and the bound key goes blank); carry per-option data via a $case in the endpoint request keyed on the string value`);
        }
      });
    }
    for (const [k, v] of Object.entries(record)) scanOptions(v, `${path}.${k}`);
  };
  scanOptions(parsed.data.layout, 'layout');
  // Options can also ride DATA (`options: "$.months"`) — same DOM constraint,
  // so the same scan walks the data defaults too.
  scanOptions((parsed.data as { data?: unknown }).data ?? {}, 'data');
  if (badOptions.length > 0) return { ok: false, data: {}, loaded: {}, issues: badOptions };

  // THE ONE-CHOICE-BEHIND RACE, refused statically. A ui:model trigger fires
  // in a race with the model-binding write, so a `call` that reads the bound
  // key without first setting it from @event.payload loads the PREVIOUS
  // value — pick August, see June. Every hand-authored screen sets first
  // (settings.action.ts documents why); this was taught to the builder and
  // promptly ignored, so like every class we have actually killed, it is now
  // teaching AND refusal.
  const raceIssues: string[] = [];
  const triggers = (parsed.data as { triggers?: { event?: string; ref?: string; do?: unknown[] }[] }).triggers ?? [];
  triggers.forEach((trigger, i) => {
    if (trigger.event !== 'ui:model' || !Array.isArray(trigger.do)) return;
    let setFromPayload = false;
    for (const step of trigger.do) {
      const record = step as Record<string, unknown> | null;
      if (record === null || typeof record !== 'object') continue;
      if (typeof record['set'] === 'string' && (record['value'] === '@event.payload' || (typeof record['value'] === 'string' && (record['value'] as string).startsWith('@event.payload')))) setFromPayload = true;
      if ('call' in record && !setFromPayload) {
        raceIssues.push(
          `triggers.${i} (ui:model "${trigger.ref ?? ''}") calls "${String(record['call'])}" without first setting the bound key from @event.payload — the model write and the trigger RACE, so the call reads the PREVIOUS value and the screen lags one choice behind. Put { "set": "<bound key>", "value": "@event.payload" } before the call.`,
        );
        break;
      }
    }
  });
  if (raceIssues.length > 0) return { ok: false, data: {}, loaded: {}, issues: raceIssues };

  // Correction QUALITY is part of the gate's job: an issue the model cannot
  // decode is a retry burned. The audit reports `set: "$.loading"` as "writes
  // a key with no default in data" — literally true (the data key is
  // `loading`, not `$.loading`) and reliably misread: runs burn their whole
  // budget re-shuffling everything BUT the `$.` prefix. Say the actual fix.
  const clarified = (issue: string): string => {
    const m = /step "set: \$\.([\w.]+)" writes a key with no default in data/.exec(issue);
    if (m !== null && m[1] !== undefined && Object.hasOwn(parsed.data.data ?? {}, m[1].split('.')[0] ?? '')) {
      return `${issue} — the data key is "${m[1]}", so write set: "${m[1]}": set paths are bare data keys, never "$."-prefixed (the "$." prefix belongs to bindings and refs)`;
    }
    return issue;
  };
  if (!audit.ok) return { ok: false, data: {}, loaded: {}, issues: audit.issues.map(clarified) };

  const issues: string[] = [];
  // Ray's wire — the trusted generative island keeps an engine-direct shim
  // (the app's data plane is moss; agents run server-side).
  type Init = { method?: string; headers?: Record<string, string>; body?: string };
  type Resp = { ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> };
  const wrap = (status: number, body: unknown): Resp => ({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
  // THE REPLY SHAPE IS THE LIVE WIRE'S, EXACTLY. Moss's session wire unwraps a
  // vex reply before the endpoint sees it — `{ result, meta }` becomes the bare
  // result (server.ts, "endpoints want the data"). This probe used to serve the
  // envelope verbatim, so it verified a contract that does not exist: a screen
  // reading `$.result` passed here and died on the live shell (prism's $ref
  // throws on a missing path — over an ARRAY, `$.result` is a missing path),
  // while a correctly-authored screen would have flunked the probe. A verifier
  // that disagrees with production is worse than none; this one now mirrors it.
  const unwrapVex = (status: number, body: unknown): Resp => {
    if (status >= 400) return wrap(status, body);
    const result =
      body !== null && typeof body === 'object' && 'result' in (body as Record<string, unknown>)
        ? (body as Record<string, unknown>)['result']
        : body;
    return wrap(status, result);
  };
  const rayFetch = async (url: string, init?: Init): Promise<Resp> => {
    const parsed = new URL(url, 'http://relay.local');
    const entities = resourceEntities(parsed.pathname);
    const { engine, db } = await ray.engine();
    if ((init?.method ?? 'GET').toUpperCase() === 'GET') {
      return unwrapVex(200, await handleDiscovery({ engine, entities, scopePolicy: ray.policy }));
    }
    const body: unknown = init?.body !== undefined ? JSON.parse(init.body) : {};
    const res = await handleQuery(
      { engine, entities, locked: true, scopePolicy: ray.policy, mutations: { client: db, policy: ray.policy } },
      body,
      { userId: ray.userId },
    );
    return unwrapVex(res.status, res.body);
  };
  // A failed endpoint call must be TALKED ABOUT, not just leave its target
  // empty — vex's error body says exactly what went wrong (a cache_miss
  // names the unknown fingerprint). Wrap the fetch and keep the bodies.
  const probeFetch: typeof rayFetch = async (url, init) => {
    const res = await rayFetch(url, init);
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
    transform: transformAmbient(ray.userId),
    fetch: probeFetch,
    onError: (e) => issues.push(`${e.code}: ${e.message}`),
  });

  // A FAILED ENDPOINT IS AN ISSUE EVEN WHEN THE ACTION HANDLES IT. An
  // onError step that flips a loading flag makes the failure invisible to
  // onError-the-shell-hook — the screen mounts politely over a dead load. The
  // shell announces every endpoint outcome; a probe exists to look.
  const offEndpoint = shell.onEndpoint((event) => {
    if (!event.ok) issues.push(`endpoint '${event.name}' FAILED (status ${event.status}) — its target was not written`);
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
    offEndpoint();
    shell.dispose();
  }
};
