import { z } from 'zod';
import { ActionDefinitionSchema } from '@niscorp/nova';
import type { ActionDefinition } from '@niscorp/nova';
import { componentsOf } from '@niscorp/nova/reflect';
import type { PgPool } from '@niscorp/vex';
import { hashIntegrationKey } from './assert';
import type { NiscApp } from './app';

// ═══════════════════════════════════════════════════════════════
// INTEGRATIONS — actions and layouts that arrive from somewhere else.
//
// An integration is a SEPARATE SERVICE. Its own repository, its own storage,
// its own deploy cycle, on its own machine. It shares no code with the app it
// extends: everything crosses a wire.
//
// That constraint decides the whole design, and most of it is subtraction:
//
//   IT SHIPS ACTIONS AND LAYOUTS. Nothing else. It cannot ship a vex entry,
//   because an entry is a compiled query authored against a schema it cannot
//   import, and the generation path is deliberately unwired. It calls what
//   discovery advertises, and if it needs a read that does not exist, that is a
//   change to the app rather than to the integration.
//
//   IT BRINGS ITS OWN STORAGE. A feature needing a column beside the app's is a
//   migration in the app, not an integration. Anything else lives on the other
//   side of the wire, keyed by identifiers we hand over.
//
//   IT ANNOUNCES; WE FETCH. There is no poll and no boot-time sweep. Registering
//   IS the announcement, it is idempotent, and re-importing is the same call.
//
//   IT REACHES EXACTLY TWO PLACES. A fingerprint the app already serves, or a
//   URL under its own prefix. Every endpoint on every action it ships is checked
//   against that at intake.
//
// Two credentials, revocable at different granularities. The integration's own
// KEY is long-lived: it acts as itself, as a principal with a charter rung, for
// work nobody asked for (a nightly sync). A per-request TOKEN is minted by the
// proxy when a person is driving: it acts on behalf of them, it lasts seconds,
// and it is only valid while the key that owns it is — so revoking one key
// kills every token it holds without storing any of them.
// ═══════════════════════════════════════════════════════════════

export type IntegrationRow = {
  id: string;
  url: string;
  status: 'pending' | 'approved' | 'revoked';
  title: string;
  tagline: string;
  adds: string;
  settingsAction: string;
  requestedActions: readonly string[];
  requestedData: readonly string[];
  approvedData: readonly string[];
  lastImportAt: number | null;
  lastError: string | null;
  actionCount: number;
};

// What an integration publishes at `<url>/bundle`. Deliberately small — the
// argument for every field it does NOT have is above. Four kinds of content,
// each its own field: WORDS (meta — for the store card, validated against
// nothing), REQUESTS (grants — approved once), ARTIFACTS (actions — pure nova,
// the schema untouched by any of this), and BINDINGS (attachments, placements,
// settings — machine-checked against what the host advertises, refused when
// wrong). Bindings live beside the artifacts, never on them: the binding names
// the action, the action never names its bindings — the same direction layout
// variants point.
const BundleSchema = z
  .object({
    integration: z.string().min(1),
    // The store card's words. Title, a line, a paragraph. An icon URL joins
    // later; nothing here is enforced beyond being text.
    meta: z
      .object({
        title: z.string().default(''),
        tagline: z.string().default(''),
        description: z.string().default(''),
      })
      .default({ title: '', tagline: '', description: '' }),
    // What it needs, which an operator approves once at registration. A bundle
    // asking for more than it was approved for goes back to pending rather than
    // silently keeping the old grants and half-working.
    grants: z
      .object({
        actions: z.array(z.string()).default([]),
        data: z.array(z.string()).default([]),
      })
      .default({ actions: [], data: [] }),
    actions: z.record(z.string(), ActionDefinitionSchema),
    // action id → HOST action it rides on (a panel on the member detail). The
    // host must have declared itself attachable — see IntakeContext. The long
    // form adds a `preview`: an endpoint under the pack's own prefix that the
    // host calls with the offered identifiers while deriving its strip, and
    // that answers with display atoms — `bands` (colors) and `hint` (a line) —
    // so the rider's row can SHOW the belt, not the word for it, while the
    // host still learns nothing about what a belt is.
    attachments: z
      .record(
        z.string(),
        z.union([z.string(), z.object({ to: z.string(), preview: z.string().default('') }).strict()]),
      )
      .default({}),
    // action id → the MENU HUB it lists under (a roster under People). The hub
    // must be one the host offers to integrations.
    placements: z.record(z.string(), z.string()).default({}),
    // The ONE action allowed to surface in the store: this integration's own
    // settings screen, reachable from its tile and from nowhere else. Add-ons
    // is a store; nothing functional lives there.
    settings: z.string().default(''),
  })
  .strict();

export type Bundle = z.infer<typeof BundleSchema>;

export type IntakeResult = { ok: true; bundle: Bundle } | { ok: false; reasons: string[] };

// ── the gate ──────────────────────────────────────────────────
//
// Everything here exists to make a mistake fail loudly at import, naming
// itself, instead of half-landing. Refusal is whole-payload: either the bundle
// is coherent and all of it lands, or none of it does and the rows from the
// last good import keep serving.

export type IntakeContext = {
  integrationId: string;
  // Component names the terminal can actually render. A layout naming anything
  // else would render nothing, and it would do so at the moment somebody
  // opened it rather than at the moment it arrived.
  components: ReadonlySet<string>;
  // Fingerprints the app serves. An action calling one that does not exist is a
  // typo now and a 404 in front of a customer later.
  fingerprints: ReadonlySet<string>;
  // Host actions that accept attachments (`NiscApp.attachable`). An
  // integration cannot ride a screen that never offered a seat.
  attachable: ReadonlySet<string>;
  // Menu hubs that accept placed screens (`NiscApp.menuSlots`). Who owns a
  // menu is the host's question; this set is its answer.
  menuSlots: ReadonlySet<string>;
};

const AUDIENCE = /^[a-z][a-z0-9-]*$/;

export const runIntake = (payload: unknown, ctx: IntakeContext): IntakeResult => {
  const parsed = BundleSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, reasons: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
  }
  const bundle = parsed.data;
  const reasons: string[] = [];

  if (bundle.integration !== ctx.integrationId) {
    reasons.push(`bundle says it is "${bundle.integration}" but was fetched as "${ctx.integrationId}"`);
  }

  for (const [id, raw] of Object.entries(bundle.actions)) {
    const action = raw as ActionDefinition;
    // ── the namespace ──
    //
    // `ext.<audience>.<integration>.<name>`. The charter grants the GLOB, once
    // per audience, so a new action needs no charter edit — and an integration
    // can only ever land inside a fence drawn before it existed.
    const parts = id.split('.');
    if (parts[0] !== 'ext' || parts.length < 4 || !AUDIENCE.test(parts[1] ?? '')) {
      reasons.push(`action ${id}: not namespaced ext.<audience>.<integration>.<name>`);
    } else if (parts[2] !== ctx.integrationId) {
      reasons.push(`action ${id}: claims the "${parts[2]}" namespace, which belongs to somebody else`);
    }

    if (action.id !== id) reasons.push(`action ${id}: its own id says "${action.id}"`);

    // ── the layout composes what the kit has ──
    for (const name of componentsOf(action.layout)) {
      if (!ctx.components.has(name)) reasons.push(`action ${id}: layout uses "${name}", which this app has no component for`);
    }

    // ── it reaches two places and no others ──
    for (const [name, endpoint] of Object.entries(action.endpoints ?? {})) {
      const ep = endpoint as { url?: string; fn?: string; request?: { fingerprint?: string } };
      if (ep.fn !== undefined) {
        // `fn:` runs IN the app's process, next to the session's shell. An
        // integration cannot ship code that runs here — that is the whole
        // point of it being a separate service.
        reasons.push(`action ${id}: endpoint "${name}" uses fn:, which runs in this app's process`);
        continue;
      }
      const url = ep.url ?? '';
      const own = `/integrations/${ctx.integrationId}/`;
      if (url.startsWith(own)) continue;
      if (!url.startsWith('/api/')) {
        reasons.push(`action ${id}: endpoint "${name}" calls "${url}" — only ${own}* or /api/*/vex`);
        continue;
      }
      const fingerprint = ep.request?.fingerprint;
      if (typeof fingerprint !== 'string') {
        reasons.push(`action ${id}: endpoint "${name}" calls the app without naming a fingerprint`);
      } else if (!ctx.fingerprints.has(fingerprint)) {
        reasons.push(`action ${id}: endpoint "${name}" calls "${fingerprint}", which this app does not serve`);
      }
    }
  }

  // ── the bindings point at things that exist, on both ends ────
  for (const [actionId, binding] of Object.entries(bundle.attachments)) {
    const host = typeof binding === 'string' ? binding : binding.to;
    const preview = typeof binding === 'string' ? '' : binding.preview;
    if (bundle.actions[actionId] === undefined) reasons.push(`attachment ${actionId}: no such action in this bundle`);
    if (!ctx.attachable.has(host)) reasons.push(`attachment ${actionId}: attaches to "${host}", which offers nothing`);
    if (preview !== '' && !preview.startsWith(`/integrations/${ctx.integrationId}/`)) {
      reasons.push(`attachment ${actionId}: preview "${preview}" is not under this integration's own prefix`);
    }
  }
  for (const [actionId, hub] of Object.entries(bundle.placements)) {
    if (bundle.actions[actionId] === undefined) reasons.push(`placement ${actionId}: no such action in this bundle`);
    if (!ctx.menuSlots.has(hub)) reasons.push(`placement ${actionId}: targets "${hub}", which accepts no integrations`);
  }
  if (bundle.settings !== '' && bundle.actions[bundle.settings] === undefined) {
    reasons.push(`settings: "${bundle.settings}" is not an action in this bundle`);
  }

  return reasons.length > 0 ? { ok: false, reasons } : { ok: true, bundle };
};

// The sentence both decision screens print — the approval card and the store
// tile say WHAT APPEARS WHERE from the same declarations, derived once here so
// neither can drift from what intake actually accepted.
export const describePlacements = (bundle: Bundle): string => {
  const parts: string[] = [];
  for (const [actionId, binding] of Object.entries(bundle.attachments)) {
    const host = typeof binding === 'string' ? binding : binding.to;
    parts.push(`a "${bundle.actions[actionId]?.title ?? actionId}" panel on ${host}`);
  }
  for (const [actionId, hub] of Object.entries(bundle.placements)) {
    parts.push(`"${bundle.actions[actionId]?.title ?? actionId}" under ${hub}`);
  }
  if (bundle.settings !== '') parts.push('a settings screen on its store tile');
  return parts.length === 0 ? '' : `Adds ${parts.join(' · ')}.`;
};

// ── the tables moss owns ─────────────────────────────────────
//
// Defined here, on the app's pool, for the same reason vex defines `vex_cache`:
// an app that had to author them would author them differently each time, and
// the shape is not application knowledge.

export const initIntegrations = async (pool: PgPool): Promise<void> => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS integrations (
      id                 text PRIMARY KEY,
      url                text NOT NULL,
      -- THE HASH, NEVER THE KEY. The integration key is minted at registration
      -- (see assert.ts for the credential rule), returned once in that response,
      -- and this is all that remains of it here. Presenting the key is the only
      -- way to produce this value again, so a stolen database does not hold a
      -- credential — and a lost key is re-registered, not recovered.
      key_hash           text,
      status             text NOT NULL DEFAULT 'pending',
      -- The store card's words, straight from the bundle's meta. Columns
      -- rather than jsonb so an app's vex read can select them like anything
      -- else on this table.
      title              text NOT NULL DEFAULT '',
      tagline            text NOT NULL DEFAULT '',
      description        text NOT NULL DEFAULT '',
      -- WHAT APPEARS WHERE, as one derived sentence (describePlacements) —
      -- printed by the approval card and the store tile from this one place.
      adds               text NOT NULL DEFAULT '',
      -- The one integration action the store may open: its settings screen.
      settings_action    text NOT NULL DEFAULT '',
      requested_actions  jsonb NOT NULL DEFAULT '[]'::jsonb,
      requested_data     jsonb NOT NULL DEFAULT '[]'::jsonb,
      approved_data      jsonb NOT NULL DEFAULT '[]'::jsonb,
      last_import_at     timestamptz,
      last_error         text
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS integration_actions (
      integration_id  text NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
      action_id       text NOT NULL,
      definition      jsonb NOT NULL,
      -- The bindings, beside the artifact and never inside it: which host
      -- action this one rides (a panel), or which menu hub lists it. Empty
      -- means neither — reachable only through whatever else names it.
      -- preview is the rider's display endpoint (own-prefix, validated at
      -- intake): the host calls it with the offered ids to paint the strip.
      attach_to       text NOT NULL DEFAULT '',
      preview         text NOT NULL DEFAULT '',
      place_in        text NOT NULL DEFAULT '',
      PRIMARY KEY (integration_id, action_id)
    )
  `);
};

// ── the bindings, read back for the host's derivations ───────
//
// Approved only, like everything else served from these tables. The app's own
// functions consume these: a hub asks which placed screens it lists, a host
// action asks which panels ride it. The app never parses a bundle.

export const listAttachments = async (pool: PgPool, hostAction: string): Promise<{ actionId: string; preview: string }[]> => {
  const res = await pool.query(
    `SELECT a.action_id, a.preview FROM integration_actions a JOIN integrations i ON i.id = a.integration_id
      WHERE i.status = 'approved' AND a.attach_to = $1 ORDER BY a.action_id`,
    [hostAction],
  );
  return res.rows.map((r) => {
    const row = r as { action_id: string; preview: string };
    return { actionId: String(row.action_id), preview: String(row.preview ?? '') };
  });
};

export const listPlacements = async (pool: PgPool): Promise<Record<string, string>> => {
  const res = await pool.query(
    `SELECT a.action_id, a.place_in FROM integration_actions a JOIN integrations i ON i.id = a.integration_id
      WHERE i.status = 'approved' AND a.place_in <> ''`,
  );
  const out: Record<string, string> = {};
  for (const r of res.rows) {
    const row = r as { action_id: string; place_in: string };
    out[String(row.action_id)] = String(row.place_in);
  }
  return out;
};

// A presented key, resolved to the integration it names — or nothing.
//
// Approved only: a pending integration holds a key (minted at registration so
// the operator ceremony is one step) but the key opens nothing until somebody
// has said yes, and a revoked or deleted row stops answering here, which is
// what makes removal kill the credential in the same act.
export const integrationByKey = async (pool: PgPool, key: string): Promise<string | undefined> => {
  const res = await pool.query("SELECT id FROM integrations WHERE key_hash = $1 AND status = 'approved'", [hashIntegrationKey(key)]);
  const id = (res.rows[0] as { id?: string } | undefined)?.id;
  return id === undefined ? undefined : String(id);
};

export const listIntegrations = async (pool: PgPool): Promise<IntegrationRow[]> => {
  const res = await pool.query(`
    SELECT i.id, i.url, i.status, i.title, i.tagline, i.adds, i.settings_action,
           i.requested_actions, i.requested_data, i.approved_data,
           i.last_import_at, i.last_error,
           (SELECT count(*) FROM integration_actions a WHERE a.integration_id = i.id) AS action_count
      FROM integrations i ORDER BY i.id
  `);
  return res.rows.map((r: unknown) => {
    const row = r as Record<string, unknown>;
    // A TIMESTAMP IS NOT ALWAYS A DATE. Different drivers hand back a Date, an
    // ISO string, or a number for the same column — PGlite returns a string
    // here, so the Date-only branch this had made every row read 'never', on a
    // field whose entire job is saying when it last worked.
    const at = row['last_import_at'];
    return {
      id: String(row['id']),
      url: String(row['url']),
      status: String(row['status']) as IntegrationRow['status'],
      title: String(row['title'] ?? ''),
      tagline: String(row['tagline'] ?? ''),
      adds: String(row['adds'] ?? ''),
      settingsAction: String(row['settings_action'] ?? ''),
      requestedActions: (row['requested_actions'] ?? []) as string[],
      requestedData: (row['requested_data'] ?? []) as string[],
      approvedData: (row['approved_data'] ?? []) as string[],
      lastImportAt: at instanceof Date ? at.getTime() : typeof at === 'string' || typeof at === 'number' ? new Date(at).getTime() : null,
      lastError: (row['last_error'] as string | null) ?? null,
      actionCount: Number(row['action_count'] ?? 0),
    };
  });
};

// Every approved integration's actions, as the manifest wants them.
export const loadIntegrationActions = async (pool: PgPool): Promise<Record<string, ActionDefinition>> => {
  const res = await pool.query(
    `SELECT a.action_id, a.definition FROM integration_actions a
       JOIN integrations i ON i.id = a.integration_id
      WHERE i.status = 'approved'`,
  );
  const out: Record<string, ActionDefinition> = {};
  for (const r of res.rows) {
    const row = r as Record<string, unknown>;
    out[String(row['action_id'])] = row['definition'] as ActionDefinition;
  }
  return out;
};

// ── which integration an action belongs to ───────────────────
//
// `ext.<audience>.<integration>.<name>` → the integration. Derived, never
// stored twice.
export const integrationOfAction = (id: string): string | undefined =>
  id.startsWith('ext.') ? id.split('.')[2] : undefined;

// INSTALLATION IS PER TENANT, and this is where that lands.
//
// The charter grants `ext.desk.*` once, to every desk in the deployment — so
// without this, one studio installing a pack puts it on every studio's front
// desk. Moss cannot filter that itself: it does not know what a studio is, on
// purpose. The app answers, and the answer is a list of ids.
export const filterInstalled = (ids: readonly string[], installed: ReadonlySet<string> | undefined): readonly string[] => {
  if (installed === undefined) return ids;
  return ids.filter((id) => {
    const owner = integrationOfAction(id);
    return owner === undefined || installed.has(owner);
  });
};

// ── the contract an integration is built against ─────────────
//
// With no shared code, an author cannot import a fingerprint constant or a
// component name. This is what replaces those imports: the same information,
// over the wire, in the two formats somebody might want it in.
export type Contract = {
  components: readonly string[];
  audiences: readonly string[];
  namespace: string;
  actionSchema: string;
  // The placement vocabulary: which host actions offer a seat (and what they
  // hand a rider), and which menu hubs accept placed screens.
  attachable: Record<string, readonly string[]>;
  menuSlots: readonly string[];
};

export const buildContract = (app: NiscApp, integrationId: string): Contract => {
  const components = Object.keys(app.shell?.components ?? {}).sort();
  // Every audience the charter has drawn an `ext.` fence for. An integration
  // may claim a namespace under these and nowhere else.
  const audiences = new Set<string>();
  for (const def of Object.values(app.charter)) {
    if (def === undefined || Array.isArray(def)) continue;
    const selection = def.actions;
    const list = Array.isArray(selection) ? selection : ((selection as { allow?: string[] } | undefined)?.allow ?? []);
    for (const entry of list) {
      const parts = String(entry).split('.');
      if (parts[0] === 'ext' && parts[1] !== undefined && parts[1] !== '*') audiences.add(parts[1]);
    }
  }
  // Only the offered KEYS are advertised — the host's data paths are its
  // private wiring, not part of any contract an author builds against.
  const attachable: Record<string, readonly string[]> = {};
  for (const [action, offers] of Object.entries(app.attachable ?? {})) attachable[action] = Object.keys(offers);
  return {
    components,
    audiences: [...audiences].sort(),
    namespace: `ext.<audience>.${integrationId}.<name>`,
    actionSchema: 'nova ActionDefinition',
    attachable,
    menuSlots: [...(app.menuSlots ?? [])],
  };
};

export const contractAsMarkdown = (contract: Contract, fingerprints: readonly string[]): string =>
  [
    `# What you can build against`,
    ``,
    `## Your namespace`,
    ``,
    `    ${contract.namespace}`,
    ``,
    `Every action you ship must be named this way. Audiences available: ${contract.audiences.join(', ') || '(none)'}.`,
    ``,
    `## Components your layouts may use`,
    ``,
    contract.components.map((c) => `- ${c}`).join('\n') || '(none)',
    ``,
    `## Fingerprints you may call`,
    ``,
    `Endpoints may target \`/api/<resource>/vex\` with one of these, or any URL under`,
    `\`/integrations/<your id>/\`. Nothing else.`,
    ``,
    fingerprints.map((f) => `- ${f}`).join('\n') || '(none — your grants reach nothing yet)',
    ``,
    `## Where your screens may appear`,
    ``,
    `Declare \`attachments\` (action → host action) to ride a host screen, and`,
    `\`placements\` (action → hub) to list under a menu hub. \`settings\` names the one`,
    `action the store tile opens. Anything else is refused.`,
    ``,
    `Attachable, with what each hands you as input:`,
    ``,
    Object.entries(contract.attachable)
      .map(([action, offers]) => `- ${action} — offers ${offers.join(', ') || '(nothing)'}`)
      .join('\n') || '(none)',
    ``,
    `Menu hubs accepting placements:`,
    ``,
    contract.menuSlots.map((hub) => `- ${hub}`).join('\n') || '(none)',
    ``,
    `## What you cannot ship`,
    ``,
    `- vex entries or mutations. Call what is listed above; if you need a read that`,
    `  does not exist, it is a change to the app.`,
    `- \`fn:\` endpoints. Those run in the app's process.`,
    `- components. Layouts compose what is listed above.`,
    `- tables. Bring your own storage; we hand you identifiers.`,
    ``,
  ].join('\n');
