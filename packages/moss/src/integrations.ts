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
  offers: readonly string[];
  needs: readonly string[];
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
    // The store card's words, and the listing page's long form. Title, a
    // line, a paragraph — then the story (sections a page renders in order),
    // the highlight lines, and the press images. Story and highlights are
    // text, enforced as nothing more; press is the one field with teeth: each
    // entry is a path under the integration's own prefix, fetched ONCE at
    // intake and copied to the host (copyPress), never fetched at render
    // time. Strict, unlike before: a typo'd key here used to strip silently,
    // which is not what "intake refuses anything outside the vocabulary"
    // means.
    meta: z
      .object({
        title: z.string().default(''),
        tagline: z.string().default(''),
        description: z.string().default(''),
        story: z.array(z.object({ heading: z.string(), prose: z.string() }).strict()).default([]),
        highlights: z.array(z.string()).default([]),
        press: z.array(z.string()).default([]),
      })
      .strict()
      .default({ title: '', tagline: '', description: '', story: [], highlights: [], press: [] }),
    // What it needs, which an operator approves once at registration. A bundle
    // asking for more than it was approved for goes back to pending rather than
    // silently keeping the old grants and half-working.
    grants: z
      .object({
        actions: z.array(z.string()).default([]),
        data: z.array(z.string()).default([]),
      })
      .default({ actions: [], data: [] }),
    // WHAT IT TELLS AND WHAT IT HEARS — the fact kinds this integration
    // publishes and the kinds it consumes. moss validates shape and carries
    // them; what a kind MEANS is the host's contract vocabulary, exactly as
    // `meta` is words validated against nothing. There is no optional flag
    // to declare: the host's laws forbid a hard dependency between
    // integrations, so every need is soft by construction — absence
    // degrades, and the store says so in a sentence the HOST prints.
    offers: z.array(z.string()).default([]),
    needs: z.array(z.string()).default([]),
    actions: z.record(z.string(), ActionDefinitionSchema),
    // action id → HOST action it rides on (a panel on the member detail). The
    // host must have declared itself attachable — see IntakeContext. The long
    // form adds a `preview`: an endpoint under the integration's own prefix that the
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
    // PAGES THE INTEGRATION SERVES AND THE HOST FRAMES. Lyra validates every layout
    // against a fixed component vocabulary, so an integration cannot ship UI — which is
    // right until a vendor's own browser SDK is the only way to render
    // something (a payment onboarding form). The answer is not to teach the
    // host's kit about the vendor: it is for the integration to serve a page and the
    // host to frame it, at its own origin, gated by exactly what every other
    // integration call is gated by.
    //
    // Named lyra-side, like `preview`, and under the integration's own prefix. What is
    // inside a frame the host does NOT validate — that is the real cost, and it
    // is why this is a declaration rather than an iframe a layout can conjure.
    //
    // PATH → THE ACTION IT BELONGS TO, and the second half is not decoration.
    // A grant is minted for whoever asks, so without an owner the only questions
    // this door could ask were "signed in?" and "installed here?" — which a
    // member of the gym passes. Naming the action makes the grant answerable
    // against the charter: a page belonging to a desk screen is mintable by
    // somebody who holds that desk screen, and by nobody else.
    frames: z.record(z.string(), z.string()).default({}),
    // The ONE action allowed to surface in the store: this integration's own
    // settings screen, reachable from its tile and from nowhere else. Add-ons
    // is a store; nothing functional lives there.
    settings: z.string().default(''),
    // THE INTEGRATION'S OWN WORDS, in the languages it speaks — the same
    // `(language, source, text)` shape the host's book uses, keyed by
    // LANGUAGE, never by full locale: Vienna and Hamburg read the same
    // sentences, and region is money and dates, which never come from a
    // book. A malformed key refuses the whole bundle at intake, exactly as a
    // placement outside the vocabulary does. The host merges these under its
    // own book, so an integration can never rename a host word.
    phrasebook: z.record(z.string().regex(/^[a-z]{2}$/, 'a phrasebook is keyed by LANGUAGE (`de`), never by locale (`de-AT`)'), z.record(z.string(), z.string())).default({}),
  })
  .strict();

export type Bundle = z.infer<typeof BundleSchema>;

export type IntakeResult = { ok: true; bundle: Bundle } | { ok: false; reasons: string[] };

// ── WHAT A BUNDLE MAY BE CALLED AT ───────────────────────────
//
// The intake checks below constrain what a bundle DECLARES. They never
// constrained what the proxy FORWARDS — which forwarded any path under an integration's
// prefix, for any signed-in principal at an installed studio. For a rank tracker
// that exposes rank data. For a payments service it exposes a payments service.
//
// So the declaration becomes the perimeter: the union of every endpoint a
// bundle's actions name under its own prefix, plus every preview an attachment
// rides on. Anything else is not a route this integration has, and the proxy
// answers as if it were not there.
//
// DERIVED, NEVER AUTHORED. An integration cannot widen its own reach without shipping
// the screen or the strip that uses it, and re-importing is the only thing that
// moves it — the same call an operator already makes.
const normalizeReach = (path: string): string => (path.split('?')[0] ?? '').replace(/\/+$/, '');

// ENDPOINT → THE ACTIONS THAT DECLARE IT, and the second half is the whole
// point of this shape.
//
// This used to be a flat list of paths, and the loop below threw the action id
// away — which made "is this path declared?" the only question the proxy could
// ask. It is the wrong question. The charter draws its fences per ACTION
// (`ext.desk.*` for a desk, `ext.member.*` for a member), so a perimeter that
// cannot name the action cannot enforce them, and being signed in at a studio
// that installed a payments integration was permission to call its merchant
// onboarding endpoint.
//
// Several actions may name one endpoint, which is why the value is a list. Any
// held action admits the call — the union, exactly as the charter itself
// resolves — and the integration's own declaration is what states it, printed
// on the approval card before anybody turns it on.
export type Reach = Record<string, string[]>;

export const reachOf = (bundle: Bundle, integrationId: string): Reach => {
  const own = `/integrations/${integrationId}/`;
  const reach: Reach = {};
  const admit = (url: string, actionId: string): void => {
    // A `/api/*/vex` endpoint is a call to the HOST, checked against the
    // fingerprints above. Only the integration's own prefix is reach.
    if (!url.startsWith(own)) return;
    const key = normalizeReach(url);
    const held = (reach[key] ??= []);
    if (!held.includes(actionId)) held.push(actionId);
  };
  for (const [actionId, raw] of Object.entries(bundle.actions)) {
    for (const endpoint of Object.values((raw as ActionDefinition).endpoints ?? {})) {
      admit((endpoint as { url?: string }).url ?? '', actionId);
    }
  }
  // A preview belongs to the action that rides the strip, so it inherits that
  // action's audience rather than being reachable by everybody who can see the
  // host screen it hangs off.
  for (const [actionId, binding] of Object.entries(bundle.attachments)) {
    if (typeof binding !== 'string') admit(binding.preview, actionId);
  }
  return Object.fromEntries(Object.entries(reach).sort(([a], [b]) => a.localeCompare(b)));
};

// FAIL CLOSED TWICE: a path this integration never declared, and a path no
// action the CALLER HOLDS declares. A row with no reach — one written before
// this column existed — still forwards nothing, because an empty object admits
// nothing either. A silent widening is the failure mode worth paying a
// re-import to avoid, and re-importing is one operator call.
export const reachAdmits = (reach: Reach, path: string, held: ReadonlySet<string>): boolean =>
  (reach[normalizeReach(path)] ?? []).some((actionId) => held.has(actionId));

// WITHOUT A CALLER. The operator's probe asks whether this integration declared
// a path at all, which is a question about the bundle rather than about
// anybody's grants — an operator holds no catalog and needs none, and filtering
// their diagnostic by a member's screens would make "the screen is empty"
// harder to answer rather than safer.
export const reachDeclares = (reach: Reach, path: string): boolean => reach[normalizeReach(path)] !== undefined;

// The same question at the other door. A frame names one owner rather than a
// list: a page is served by the screen that opens it, and two screens wanting
// one page is a bundle that should say so twice.
export const frameAdmits = (frames: Readonly<Record<string, string>>, path: string, held: ReadonlySet<string>): boolean => {
  const owner = frames[path];
  return owner !== undefined && held.has(owner);
};

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

// The host surface a screen calls to be handed a framed page's URL. Named once
// here because intake admits it and the frame route serves it, and two spellings
// of the same path is how a seam stops working for one caller.
export const FRAME_GRANT_URL = '/api/integrations/frame';

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
      // The one HOST surface an action may name without a fingerprint: asking
      // for a frame grant. It reads nothing and writes nothing — it hands back
      // a URL the integration's own page is served at — so there is no fingerprint for
      // it to name, and the alternative is every integration inventing its own way to
      // reach a door that already exists.
      if (url === FRAME_GRANT_URL) continue;
      if (url.startsWith(own)) {
        // `/hook/` IS RESERVED. It is the one path on this server that requires
        // no principal (server.ts, the webhook door) — a vendor calling in has
        // no session and could not have one. An action endpoint declared there
        // would be a screen's call riding the unauthenticated door, which is
        // how a door meant for one thing becomes a way around everything else.
        if (url.startsWith(`${own}hook/`)) {
          reasons.push(`action ${id}: endpoint "${name}" is under /hook/, which is the unauthenticated webhook path`);
        }
        // `/frame/` is where a grant is REDEEMED — a browser GET carrying a
        // token instead of a session. An action endpoint there would be a
        // screen's call spending a credential meant for a document.
        if (url.startsWith(`${own}frame/`)) {
          reasons.push(`action ${id}: endpoint "${name}" is under /frame/, which redeems frame grants`);
        }
        continue;
      }
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
  // A FRAMED PAGE IS STILL THE INTEGRATION'S OWN GROUND. Same prefix rule as a
  // preview, and neither reserved door: `/hook/` needs no principal and
  // `/frame/` is where a grant is spent, so a page served at either would be
  // reachable by something other than the grant that was minted for it.
  const ownPrefix = `/integrations/${ctx.integrationId}/`;
  for (const [path, actionId] of Object.entries(bundle.frames)) {
    if (!path.startsWith(ownPrefix)) {
      reasons.push(`frame "${path}": not under this integration's own prefix`);
    } else if (path.startsWith(`${ownPrefix}hook/`) || path.startsWith(`${ownPrefix}frame/`)) {
      reasons.push(`frame "${path}": /hook/ and /frame/ are reserved`);
    }
    // The owner has to be real, or the grant check below it can never pass and
    // the page is simply unreachable — a refusal at intake beats a screen that
    // opens onto nothing.
    if (bundle.actions[actionId] === undefined) {
      reasons.push(`frame "${path}": belongs to "${actionId}", which is not an action in this bundle`);
    }
  }
  // PRESS IS FETCHED ONCE, AT INTAKE — it is never reach (reachOf sweeps
  // declarations; these are deliberately not among them) and the proxy never
  // forwards it. The paths still obey the same fences as every other
  // declaration: the integration's own ground, neither reserved door.
  for (const path of bundle.meta.press) {
    if (!path.startsWith(ownPrefix)) {
      reasons.push(`press "${path}": not under this integration's own prefix`);
    } else if (path.startsWith(`${ownPrefix}hook/`) || path.startsWith(`${ownPrefix}frame/`)) {
      reasons.push(`press "${path}": /hook/ and /frame/ are reserved`);
    }
  }
  if (bundle.settings !== '' && bundle.actions[bundle.settings] === undefined) {
    reasons.push(`settings: "${bundle.settings}" is not an action in this bundle`);
  }

  return reasons.length > 0 ? { ok: false, reasons } : { ok: true, bundle };
};

// The sentence both decision screens print — the approval card and the store
// tile say WHAT APPEARS WHERE from the same declarations, derived once here so
// neither can drift from what intake actually accepted.
export const describePlacements = (bundle: Bundle, names: Readonly<Record<string, string>> = {}): string => {
  // IDS ARE FOR WIRES; THIS SENTENCE IS FOR A PERSON.
  //
  // It is printed on the approval card and on the store tile — both read by
  // somebody deciding whether to turn an integration on — and `hub.money` told them
  // nothing they did not already have to guess. The host supplies the words for
  // its own hubs and screens (`NiscApp.placementNames`); anything it has no word
  // for falls back to the id, which is honest rather than blank.
  const say = (id: string): string => names[id] ?? id;
  const parts: string[] = [];
  for (const [actionId, binding] of Object.entries(bundle.attachments)) {
    const host = typeof binding === 'string' ? binding : binding.to;
    parts.push(`a "${bundle.actions[actionId]?.title ?? actionId}" panel on ${say(host)}`);
  }
  for (const [actionId, hub] of Object.entries(bundle.placements)) {
    parts.push(`"${bundle.actions[actionId]?.title ?? actionId}" under ${say(hub)}`);
  }
  if (bundle.settings !== '') parts.push('a settings screen on its store tile');
  return parts.length === 0 ? '' : `Adds ${parts.join(' · ')}.`;
};

// ── press, copied at intake ──────────────────────────────────
//
// A listing sells with images, and the store never fetches from a service at
// render time — a dead add-on degrades its screens (injection stays an
// attempt), never its listing. So the bytes cross ONCE, here: each declared
// path is fetched from the service through the same mapping the proxy uses,
// handed to the host's seam (NiscApp.storePress), and the URL the host
// answers with is what the row keeps.
//
// Refusal is whole-payload, like everything else at this gate: a dead path, a
// non-image answer, a seam that throws — or press declared on a deployment
// with no seam to hold it — refuses the bundle with a sentence naming the
// path, and the last good import keeps serving. The engine invents no bounds
// of its own: too big and too many are the seam's to refuse, and its refusal
// arrives here as any other.
//
// The stored NAME is the path under the prefix, deterministic per
// (integration, path): a re-import overwrites its own images rather than
// accumulating copies.

export type StorePress = (integrationId: string, name: string, bytes: Uint8Array, contentType: string) => Promise<string>;

export type PressResult = { ok: true; urls: string[] } | { ok: false; reasons: string[] };

export const copyPress = async (
  bundle: Bundle,
  integrationId: string,
  serviceUrl: string,
  store: StorePress | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<PressResult> => {
  const declared = bundle.meta.press;
  if (declared.length === 0) return { ok: true, urls: [] };
  if (store === undefined) {
    return { ok: false, reasons: [`press: the bundle declares ${declared.length} image(s), and this deployment has no storePress seam to hold them`] };
  }
  const own = `/integrations/${integrationId}/`;
  const urls: string[] = [];
  for (const path of declared) {
    const rest = path.slice(own.length);
    try {
      const response = await fetchImpl(`${serviceUrl.replace(/\/$/, '')}/${rest}`);
      if (!response.ok) return { ok: false, reasons: [`press "${path}": the service answered ${response.status}`] };
      const contentType = (response.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '';
      if (!contentType.startsWith('image/')) {
        return { ok: false, reasons: [`press "${path}": answered "${contentType === '' ? 'nothing' : contentType}", which is not an image`] };
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      urls.push(await store(integrationId, rest, bytes, contentType));
    } catch (err) {
      return { ok: false, reasons: [`press "${path}": ${String(err)}`] };
    }
  }
  return { ok: true, urls };
};

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
}): CallIntegration => {
  const fetchImpl = deps.fetchImpl ?? fetch;
  return async (id, path, init) => {
    const row = await deps.pool.query('SELECT url, status FROM integrations WHERE id = $1', [id]);
    const found = row.rows[0] as { url?: string; status?: string } | undefined;
    if (found === undefined) throw new Error(`moss: callIntegration("${id}"): no such integration.`);
    if (found.status !== 'approved') throw new Error(`moss: callIntegration("${id}"): not approved (status "${String(found.status)}").`);
    const installed = await deps.installedFor(init.principal);
    if (installed !== undefined && !installed.includes(id)) {
      throw new Error(`moss: callIntegration("${id}"): not installed for "${init.principal}".`);
    }
    const scope = { ...(await deps.scopeValuesFor(init.principal)), ...(init.scope ?? {}) };
    const target = `${String(found.url).replace(/\/$/, '')}/${path.replace(/^\/+/, '')}`;
    return fetchImpl(target, {
      method: init.method ?? 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${deps.mint({ integration: id, principal: init.principal, scope })}`,
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  };
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
      -- The listing page's long form, re-imported whole like everything else
      -- about a bundle. press holds the URLS THE HOST ANSWERED WITH at
      -- intake (copyPress), never the paths the bundle declared — the listing
      -- composes from host ground alone.
      story              jsonb NOT NULL DEFAULT '[]'::jsonb,
      highlights         jsonb NOT NULL DEFAULT '[]'::jsonb,
      press              jsonb NOT NULL DEFAULT '[]'::jsonb,
      -- WHAT APPEARS WHERE, as one derived sentence (describePlacements) —
      -- printed by the approval card and the store tile from this one place.
      adds               text NOT NULL DEFAULT '',
      -- The one integration action the store may open: its settings screen.
      settings_action    text NOT NULL DEFAULT '',
      requested_actions  jsonb NOT NULL DEFAULT '[]'::jsonb,
      requested_data     jsonb NOT NULL DEFAULT '[]'::jsonb,
      approved_data      jsonb NOT NULL DEFAULT '[]'::jsonb,
      -- What it tells and hears (bundle offers/needs), beside the grants
      -- because they are the same kind of thing: the integration's declared
      -- statement, written at import, replaced on re-registration. moss
      -- never reads them; the host's bus does.
      offers             jsonb NOT NULL DEFAULT '[]'::jsonb,
      needs              jsonb NOT NULL DEFAULT '[]'::jsonb,
      -- EVERY PATH THE PROXY MAY FORWARD, derived from the bundle at intake
      -- (reachOf). Beside the grants because it is one: a grant of reach, held
      -- by the same row, revoked by the same delete.
      reach              jsonb NOT NULL DEFAULT '[]'::jsonb,
      -- Pages this integration serves and the host frames. Kept apart from reach
      -- because they are spent differently: reach is a screen's call carrying a
      -- session, a frame is a document GET carrying a grant.
      frames             jsonb NOT NULL DEFAULT '[]'::jsonb,
      last_import_at     timestamptz,
      last_error         text
    )
  `);
  // The table predates these columns, and `CREATE TABLE IF NOT EXISTS` will not
  // add them to a deployment that already has one. Fail-closed until re-import.
  await pool.query(`ALTER TABLE integrations ADD COLUMN IF NOT EXISTS reach jsonb NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE integrations ADD COLUMN IF NOT EXISTS frames jsonb NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE integrations ADD COLUMN IF NOT EXISTS phrasebook jsonb NOT NULL DEFAULT '{}'::jsonb`);
  await pool.query(`ALTER TABLE integrations ADD COLUMN IF NOT EXISTS story jsonb NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE integrations ADD COLUMN IF NOT EXISTS highlights jsonb NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE integrations ADD COLUMN IF NOT EXISTS press jsonb NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE integrations ADD COLUMN IF NOT EXISTS offers jsonb NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE integrations ADD COLUMN IF NOT EXISTS needs jsonb NOT NULL DEFAULT '[]'::jsonb`);
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
           i.offers, i.needs,
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
      offers: (row['offers'] ?? []) as string[],
      needs: (row['needs'] ?? []) as string[],
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
// without this, one studio installing an integration puts it on every studio's front
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
