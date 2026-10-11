import type { Feature, FeatureSeams, Replay } from '../feature';
import { KEY_PREFIX, keyCredential } from './actor';
import type { IntegrationActor } from './actor';
import { callIntegrationWith } from './call';
import type { CallIntegration } from './call';
import { contractRoutes } from './contract';
import { createAssertionSigner } from './credentials';
import { REGISTRY_ENTRIES, REGISTRY_TABLES } from './entries';
import { flooredWire } from './floor';
import { createForwarder } from './forward';
import { frameRoutes } from './frame';
import { filterInstalled, integrationOfAction } from './installed';
import { operatorRoutes } from './operator';
import type { StorePress } from './press';
import { proxyRoutes } from './proxy';
import { findIntegration, integrationByKey, listAttachments, listPlacements, loadIntegrationActions } from './registry';
import { INTEGRATIONS_SEQUENCE, STORED_ACTIONS } from './tables';

// ═══════════════════════════════════════════════════════════════
// THE FEATURE — integrations as one object an app creates, configures and
// puts in its manifest's `features`.
//
// `createIntegrations(config)` is what the app says about itself: where an
// integration may appear, who it is when it acts alone, where its press
// images land. The server starts the feature with the seams (../feature), and
// everything it adds to the app it adds through them: its routes, its
// credential, the actions of the integrations that were approved, the rule
// for what is installed where, the sentence under a failing call.
//
// The same object carries the calls an app makes afterwards. They work once
// a server has started the feature, and say so in a sentence before that.
// ═══════════════════════════════════════════════════════════════

export type IntegrationsConfig = {
  // WHO AN INTEGRATION IS when it acts and nobody is driving (./actor.ts). The
  // app answers with a principal, and from there NOTHING is special: that
  // principal's charter rung compiles its policy, its scope values pin its
  // rows, and the engine stamps its writes.
  //
  // Returning null refuses: an integration the tenant has not installed, a
  // tenant that does not exist, an app that has no actor for unattended work.
  // Absent = integration keys resolve to nobody and every keyed call is 403.
  // May be async: an app answering this from rows reads the row.
  integrationActor?: IntegrationActor;
  // WHERE AN INTEGRATION MAY APPEAR — the host's half of the placement
  // contract, advertised on the discovery surface and enforced at intake.
  //
  // `attachable`: host action id → the offers, as {offered key: host data
  // path} (a member detail offering `membership_id` from `$.membershipId`).
  // Declaring an action here is declaring a seat. The KEYS are the contract —
  // advertised on discovery, what a rider receives as input and what a
  // preview call carries. The PATHS are the host's private wiring: how its
  // own strip derivation and push trigger read those values off its data —
  // a rider never sees them.
  attachable?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  // `menuSlots`: hub action ids whose item lists accept placed integration
  // screens. Who owns a menu is the host's question; this list is its answer,
  // and intake refuses a placement outside it.
  menuSlots?: readonly string[];
  // THE VOCABULARY AN ADD-ON'S DECLARATIONS MAY NAME — the same posture as
  // `menuSlots`: the host names what it offers, intake refuses anything outside
  // it, so a `documents`/`assistants` declaration fails at registration, not in
  // front of a person. The names are carried; what a tool DOES, what a check
  // MEANS, and which region an id draws are the host's.
  //
  // `assistantTools`: the host's closed assistant tool set; an `assistants`
  // declaration's `tools[]` is checked against it.
  assistantTools?: readonly string[];
  // `publishChecks`: the checks the host runs before publishing a document; a
  // `documents` declaration's `checks[]` is checked against it.
  publishChecks?: readonly string[];
  // `editorRegions`: region action ids the host's editor offers a document
  // beyond the bundle's own actions; a `documents` declaration's `regions`
  // values are admitted if they are one of these OR one of the bundle's actions.
  editorRegions?: readonly string[];
  // WORDS FOR THE IDS ABOVE, for the one sentence a person reads before
  // turning an integration on. Optional: without it the approval card and store tile
  // print ids, which is honest and unhelpful.
  placementNames?: Readonly<Record<string, string>>;
  // WHERE PRESS IMAGES LAND. A bundle may declare listing images
  // (meta.press); intake fetches the bytes once and hands them here, and the
  // URL this answers with is what the store serves forever after — the host's
  // blob store, its bounds, its refusals (throw, and the bundle is refused
  // whole). Optional: a deployment without one refuses any bundle that
  // declares press, which is a sentence at import rather than a hole in a
  // listing.
  storePress?: StorePress;
  // A FIXED SEED FOR THE KEYPAIR ASSERTIONS ARE SIGNED WITH (./credentials.ts).
  // 32 bytes, as base64. Without one the keypair is made when the feature
  // starts and kept nowhere, so every boot has a new one: right where a
  // restart costing one retry is fine, and wrong where an integration's
  // service holds the public half in its environment and every restart, or
  // every other process of the deployment, would be signing with a key it
  // does not know. With one, the public half stays put.
  //
  // The feature's own setting, and nobody else's: the private half of that key
  // is made from it, so it is said here, to the one thing that signs, and is
  // on no object another feature is handed. One that decodes to fewer than 32
  // bytes refuses the boot, with a sentence that says its length.
  signingSeed?: string;
  // HOW LONG A CALL OUT TO AN INTEGRATION'S SERVICE MAY TAKE, in ms, its
  // answer and its body together. Every call: a screen's through the proxy, a
  // framed page and its callback, a vendor's webhook, `callIntegration`, the
  // bundle fetched at registration, the operator's probe, one press image.
  // Past it the call is given up on, and reads as a service that is
  // unreachable. Default 30000, nova's default wait for an endpoint's reply.
  // The shorter of the two ends a call: an integration whose endpoint is slow
  // by nature, and says so with a longer `timeoutMs` on its action, needs this
  // raised as well.
  outboundTimeoutMs?: number;
  // HOW LARGE ONE PRESS IMAGE MAY BE, in bytes. Held to while the image is
  // read: a larger one is given up on where it crosses the line, and refuses
  // the bundle. Default 5 MiB, which nobody measured: it is a number that
  // lets a listing image through and keeps one import from holding an
  // arbitrary body in memory.
  pressMaxBytes?: number;
};

const DEFAULT_OUTBOUND_TIMEOUT_MS = 30_000;
const DEFAULT_PRESS_MAX_BYTES = 5 * 1024 * 1024;

export type Integrations = Feature & {
  // CALL AN INSTALLED INTEGRATION WHEN NOBODY IS DRIVING — the outbound half
  // of `executeAs`. Refuses (throws) unless it is approved and installed for
  // this principal's tenant, mints the assertion, and returns what the
  // integration answered, whatever it answered. Deliberately not gated by
  // reach: a lifecycle verb is not an action and has no screen (./call.ts).
  callIntegration: CallIntegration;
  // THE BINDINGS, read back for the host's own derivations; approved
  // integrations only. Which of their actions ride a host action, each with
  // its preview endpoint ('' when it has none)...
  listAttachments: (hostAction: string) => Promise<{ actionId: string; preview: string }[]>;
  // ...and which are placed under a menu hub: action id → hub.
  listPlacements: () => Promise<Record<string, string>>;
  // The approved integration a presented key belongs to, or undefined.
  integrationByKey: (key: string) => Promise<string | undefined>;
  // `ext.<audience>.<integration>.<name>` → the integration. Reads nothing,
  // and answers before any server is there.
  integrationOfAction: (actionId: string) => string | undefined;
};

// The name the integrations' actions are handed to the running manifest
// under, and read again by.
const SOURCE = 'integrations';

// What the calls an app makes are made of, once a server has started the
// feature.
type Started = { replay: Replay; call: CallIntegration };

const start = async (config: IntegrationsConfig, seams: FeatureSeams): Promise<Started> => {
  // THE REGISTRY'S READS AND WRITES, handed over as entries of the feature's
  // own: seeded where no route serves them, and replayed from here on by
  // `replay` (./registry.ts, ./entries.ts).
  const replay = await seams.ownEntries(REGISTRY_ENTRIES);
  // THE STORED ACTIONS, BROUGHT TO THIS CODE'S GRAMMARS before one is read
  // (./tables.ts). The rows are this feature's, so the asking is: the core
  // upgrades no row of its own accord.
  await seams.upgradeStore(STORED_ACTIONS);
  const find = (id: string): ReturnType<typeof findIntegration> => findIntegration(replay, id);
  // THE DEPLOYMENT'S SIGNING IDENTITY — how an integration knows a call is
  // ours. The public half is served; verifying is all anybody can do with it
  // (./credentials.ts).
  const signer = createAssertionSigner(config.signingSeed);
  const timeoutMs = config.outboundTimeoutMs ?? DEFAULT_OUTBOUND_TIMEOUT_MS;
  const forward = createForwarder({ find, who: seams.who, scopeOf: seams.scopeOf, mint: signer.mint, timeoutMs });
  // Approved integrations' actions, read from rows. Handed to the running
  // manifest after an import, an approval and a removal: the set is verified
  // with everything else, and only then is it served.
  const stored = (): ReturnType<typeof loadIntegrationActions> => loadIntegrationActions(replay, seams.grammars);
  const reload = async (): Promise<void> => seams.replaceActions(SOURCE, await stored());

  seams.narrowCatalogs(filterInstalled);
  seams.loadActionsFrom(SOURCE, stored);
  seams.credential(KEY_PREFIX, keyCredential({ byKey: (key) => integrationByKey(replay, key), actor: config.integrationActor, who: seams.who }));
  seams.wrapWire(flooredWire);

  // What the host offers a bundle to name: the kit's components, which the
  // server knows, and what the app said when it created the feature.
  const vocabulary = {
    components: seams.components,
    attachable: config.attachable,
    menuSlots: config.menuSlots,
    assistantTools: config.assistantTools,
    publishChecks: config.publishChecks,
    editorRegions: config.editorRegions,
  };
  seams.routes(
    contractRoutes({
      host: { components: seams.components, charter: seams.charter, attachable: config.attachable, menuSlots: config.menuSlots },
      fingerprintsFor: seams.fingerprintsFor,
      verifyKey: signer.verifyKey,
    }),
  );
  seams.operatorRoutes(
    operatorRoutes({
      replay,
      grammars: seams.grammars,
      fingerprints: seams.fingerprints,
      vocabulary,
      actions: seams.actions,
      refusalOf: seams.refusalOf,
      reload,
      placementNames: config.placementNames ?? {},
      storePress: config.storePress,
      timeoutMs,
      pressMaxBytes: config.pressMaxBytes ?? DEFAULT_PRESS_MAX_BYTES,
    }),
  );
  // The frame doors, then the webhook, then the proxy: the proxy's pattern
  // matches every path the other three serve.
  seams.routes(frameRoutes({ replay, who: seams.who, holds: seams.holds, forward }));
  seams.routes(proxyRoutes({ holds: seams.holds, forward }));

  // WHATEVER WAS APPROVED BEFORE THIS PROCESS STARTED is part of the
  // application, so it is folded in before anything is served — not on first
  // request and not on a timer.
  const approved = await stored();
  if (Object.keys(approved).length > 0) seams.replaceActions(SOURCE, approved);

  return { replay, call: callIntegrationWith({ forward, ...(seams.telemetry === undefined ? {} : { telemetry: seams.telemetry }) }) };
};

export const createIntegrations = (config: IntegrationsConfig = {}): Integrations => {
  // What the last server to start this feature gave it. A manifest is handed
  // to one server; a process that builds a second from the same manifest (a
  // dev floor rebuilding) has the calls follow the one built last.
  let started: Started | undefined;
  const running = (call: string): Started => {
    if (started === undefined) {
      throw new Error(
        `moss: integrations.${call} was called before a server started the feature. Put what createIntegrations returned in the manifest's \`features\`, and call it once createServer has answered.`,
      );
    }
    return started;
  };
  return {
    name: 'integrations',
    // The three tables that are its own, and the sequence that makes the
    // third (./tables.ts says where the first two are made).
    tables: { names: REGISTRY_TABLES, sequences: [INTEGRATIONS_SEQUENCE] },
    start: async (seams) => {
      started = await start(config, seams);
    },
    callIntegration: async (id, path, init) => running('callIntegration').call(id, path, init),
    listAttachments: async (hostAction) => listAttachments(running('listAttachments').replay, hostAction),
    listPlacements: async () => listPlacements(running('listPlacements').replay),
    integrationByKey: async (key) => integrationByKey(running('integrationByKey').replay, key),
    integrationOfAction,
  };
};
