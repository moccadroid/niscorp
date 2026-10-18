import { createShell, ActionDefinitionSchema, auditAction, type PublicActionRuntime } from '@niscorp/nova';
import { classifyAudit } from '@niscorp/nova/reflect';
import { flattenSchemaIssues } from '@niscorp/cortex';
import { evaluate } from '@niscorp/prism';
import { buildRegistry } from '@relay/ui';
import type { RayContext } from '../seams';
import { todayStr } from '@relay/lib/date';
import { knownChannels, pushTargets } from '../knowledge';

export type RunResult = {
  ok: boolean;
  data: Record<string, unknown>;
  issues: string[];
  loaded: Record<string, string>;
};

// The same endpoint transform the live shell injects.
const transformAmbient = (userId: string) => (config: unknown, source: unknown): unknown =>
  evaluate(
    config as Parameters<typeof evaluate>[0],
    (source !== null && typeof source === 'object' && !Array.isArray(source)
      ? { ...(source as Record<string, unknown>), userId, today: todayStr() }
      : source) as Parameters<typeof evaluate>[1],
  );

// `shell.push` does not wait for the mount. Bounded so a hung endpoint cannot hang the probe.
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

type RenderedNode = { type?: string; name?: string; props?: Record<string, unknown>; children?: RenderedNode[] };

const tablesIn = (nodes: readonly RenderedNode[]): RenderedNode[] =>
  nodes.flatMap((node) => [...(node.type === 'component' && node.name === 'Table' ? [node] : []), ...tablesIn(node.children ?? [])]);

// Loaded rows a Table does not show: the screen mounts over its data and draws none of it.
const unshownRows = (shell: ReturnType<typeof createShell>, definition: { endpoints?: Record<string, Endpointish> }, data: Record<string, unknown>): string[] => {
  const loaded = Object.values(definition.endpoints ?? {})
    .map((endpoint) => endpoint.target)
    .filter((target): target is string => typeof target === 'string' && Array.isArray(data[target]) && (data[target] as unknown[]).length > 0);
  if (loaded.length === 0) return [];
  const tables = tablesIn(shell.flattenRenderTree(shell.getCanvasRenderTree('main')) as RenderedNode[]);
  return tables
    .filter((table) => !Array.isArray(table.props?.['rows']) || (table.props?.['rows'] as unknown[]).length === 0)
    .map(() => `a Table renders no rows while ${loaded.map((target) => `"${target}" holds ${(data[target] as unknown[]).length}`).join(', ')}: bind its rows (rows: "$.${loaded[0] ?? ''}")`);
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
      issues: flattenSchemaIssues(parsed.error.issues).map(
        (i) => `${i.path.join('.') || '(root)'}: ${i.message}`,
      ),
    };
  }

  // Mounting replays only the default state, never another branch of a $case, so
  // every `fp_…` literal is checked statically. Seeded names (`deals/list`) pass.
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
    catalog: pushTargets(),
    channels: knownChannels(),
  });
  // The binding resolver knows string paths, moustache and the directives below.
  // A prism node in a layout prop is walked as a plain object: it renders empty, with no error.
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
  scanOptions((parsed.data as { data?: unknown }).data ?? {}, 'data');
  if (badOptions.length > 0) return { ok: false, data: {}, loaded: {}, issues: badOptions };

  const clarified = (issue: string): string => {
    const m = /step "set: \$\.([\w.]+)" writes a key with no default in data/.exec(issue);
    if (m !== null && m[1] !== undefined && Object.hasOwn(parsed.data.data ?? {}, m[1].split('.')[0] ?? '')) {
      return `${issue} — the data key is "${m[1]}", so write set: "${m[1]}": set paths are bare data keys, never "$."-prefixed (the "$." prefix belongs to bindings and refs)`;
    }
    return issue;
  };
  // A push to a `{{…}}` template target is reported as not in the catalog; `classifyAudit` sets it aside.
  const toAddress = audit.issues.filter((issue) => classifyAudit(issue).kind === 'address');
  if (toAddress.length > 0) return { ok: false, data: {}, loaded: {}, issues: toAddress.map(clarified) };

  const issues: string[] = [];
  // The session's wire: what an endpoint of this screen calls when it runs for real, as the caller.
  const rayFetch = ray.wire;
  const probeFetch: typeof rayFetch = async (url, init) => {
    const res = await rayFetch(url, init);
    if (!res.ok) {
      try {
        const text = (await res.text()).slice(0, 300);
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
    actions: { [parsed.data.id]: parsed.data },
    functions: {},
    transform: transformAmbient(ray.userId),
    fetch: probeFetch,
    onError: (e) => issues.push(`${e.code}: ${e.message}`),
  });

  // An action's own onError step hides a failed endpoint from the shell's
  // onError hook, so endpoint outcomes are watched directly.
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
    issues.push(...unshownRows(shell, parsed.data, data));
    return { ok: issues.length === 0, data, issues, loaded: report.loaded };
  } finally {
    offEndpoint();
    shell.dispose();
  }
};
