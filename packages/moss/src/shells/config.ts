import type { ActionDefinition, ActionFragment, FetchFn, LayoutNode } from '@niscorp/nova';
import type { PhraseKeys } from '@niscorp/nova/i18n';
import type { QueryResponse, SeedEntry, SeedMutation } from '@niscorp/vex';
import type { Intent, QueryWriters } from '../data';
import type { NiscApp, ShellCanvas, ShellManifest } from '../manifest';
import type { Telemetry } from '../runtime';

// ═══════════════════════════════════════════════════════════════
// WHAT A SHELL HOST IS HANDED.
//
// Each member is one function or one value of whoever owns it. A host is
// handed no application manifest and no runtime: it reads nothing of either
// but what is named here, and whoever stands it up (../server, hosts.ts) says where
// each comes from.
// ═══════════════════════════════════════════════════════════════

// WHAT ONE PRINCIPAL'S SHELL IS MADE OF, answered whole, each time it is
// asked: who they are, what they hold, and the shell as the manifest says it.
//
// A build makes a shell from one of these and an adopt brings a living shell
// level with one. So which actions somebody is granted, and which layout
// their roles hold of each, is decided where this is answered, once: the host
// filters nothing and swaps nothing.
//
// EVERYTHING A SHELL IS HANDED THAT SOMEBODY AUTHORED ARRIVES HERE: its
// actions, its frame and layout store, its fragments, and the entries the
// app shipped. All but who somebody is comes from one owner (../manifest,
// `RunningManifest.artifactsFor`, whose answer is one of these without `roles`
// and `scope`), and a host reads none of it anywhere else. The entries are
// what a host is TOLD of a screen's reads. What a read replays is not in this
// answer: it goes over the wire, and its fingerprint resolves in vex's cache.
export type ShellComposition = {
  // WHO THEY ARE: the roles they hold, and the app's own scope values, handed
  // back to `inputs` and `phrases` untouched. Moss never looks inside them.
  roles: readonly string[];
  scope: Record<string, unknown>;
  // WHAT THEY HOLD: every action definition granted to them, by id, each with
  // the layout variant their roles hold of it already in its place. An action
  // that is not here does not exist for them.
  actions: Readonly<Record<string, ActionDefinition>>;
  // THE SHELL: its canvases with what each may mount first, the frame that
  // arranges them, what a `{ ref }` in the frame resolves to before anything
  // sets it, and the fragments an action may be composed with.
  canvases: readonly ShellCanvas[];
  frame?: LayoutNode;
  layoutStore?: Readonly<Record<string, LayoutNode>>;
  fragments?: Readonly<Record<string, ActionFragment>>;
  // THE ENTRIES the app shipped, by fingerprint: how a drawn screen's reads
  // are known to keep answering or not (./liveness.ts). Absent, every screen
  // is counted live: a host that cannot ask must not conclude a page is
  // finished.
  entries?: ReadonlyMap<string, SeedEntry | SeedMutation>;
  // Every component name a tree of theirs may mention, each with the contract
  // declared for it (an empty one when none is). The components themselves
  // are the terminal's: the shell validates names and serializes trees.
  components: Readonly<Record<string, ComponentContract>>;
};

// What is registered under a component's name on the server: its contract.
export type ComponentContract = NonNullable<ShellManifest['components']>[string];

// THE APP'S CODE A SHELL CALLS, each as the manifest declares it (see
// `NiscApp` and `ShellManifest`, ../manifest). All optional: a shell with none
// mounts what its canvases say and calls nothing.
export type ShellHooks = {
  // Per-principal boot input for the canvases, and the instances pushed onto
  // them once the shell stands.
  inputs?: ShellManifest['inputs'];
  seeds?: ShellManifest['seeds'];
  // The words this principal's shell wears.
  phrases?: NiscApp['phrases'];
  // The in-process endpoints, made once for a session.
  functions?: NiscApp['functions'];
  // Session code that is not an endpoint. Called for a shell that is kept and
  // for no other: a page has none.
  onSession?: NiscApp['onSession'];
  // Where a model run a session records goes.
  runs?: NiscApp['runs'];
};

export type ShellLimits = {
  // How long a durable shell may sit with NOTHING attached before it is
  // disposed. Default `DEFAULT_IDLE_MS`; `0` or `Infinity` disables the sweep
  // and shells live until sign-out or process exit. Only the idle clock is
  // swept — there is deliberately no absolute cap, because that would discard
  // the state of somebody who is working.
  idleMs?: number;
  // Send a changed canvas as a delta against the frame the connection last
  // received, instead of whole. Default off; a connection is only ever sent one
  // if it asked at attach. See `runtime.shellFrameDelta` and DOCS.md.
  delta?: boolean;
  // How long an endpoint call of a shell waits for its reply, and how long the
  // build of a shell may take: one that has not landed by then fails for
  // whoever waited on it (./host.ts, `build`). Default nova's, 30 seconds.
  endpointTimeoutMs?: number;
};

export type ShellHostConfig = {
  // What a principal's shell is made of (above). Asked once for each build,
  // and once for each living shell when what the app consists of changed.
  composition: (principal: string | null) => Promise<ShellComposition>;
  hooks: ShellHooks;
  // Which keys in a tree carry prose (`NiscApp.phraseKeys`). Absent: nova's.
  phraseKeys?: PhraseKeys;
  // Whether a principal's shell is KEPT. Default true: the app's shell is one
  // durable shell per person, the thing that rearranges itself around them. A
  // page's is not — `false` builds a shell for the length of one read or one
  // connection, whoever is asking, and runs no `onSession` (session code is the
  // app's; a page has none).
  kept?: boolean;
  // The internal wire: the server's own fetch, authorized as the session.
  wire: (token: string | null) => FetchFn;
  // LAID AROUND THE WIRE A SESSION'S SCREENS CALL THROUGH, by whoever has a
  // reason to answer for a call that failed (an integration that is down gets
  // a sentence under it; ../integrations, fallback-message.ts). It wraps the wire the
  // shell's endpoints and functions are handed, and not the one `inputs` and
  // `phrases` read through. Absent: the wire as it is.
  wrapWire?: (inner: FetchFn) => FetchFn;
  // AN INTENT ANSWERED BY A QUERY WRITTEN FOR IT, as a principal (../data,
  // routes.ts): what a session's `answerIntent` asks. Whose policy and
  // scope values it runs under is resolved by whoever supplies this, each time
  // it is asked. Absent: a session that asks is told this host cannot.
  answerIntent?: (principal: string | null, writers: QueryWriters, asked: Intent) => Promise<QueryResponse>;
  // FORGET EVERY SESSION A PRINCIPAL HOLDS: what a session's `revoke` does
  // first, where the deployment keeps the credential itself (../identity,
  // `sessionRevokerOf`). Absent: there is none to forget, and a sign-out
  // closes the terminals and disposes the shell.
  revokeSessions?: (principal: string) => Promise<void>;
  // Where a span goes (`shell.build`, `fn.call`). Absent: none is built.
  telemetry?: Telemetry;
  limits?: ShellLimits;
};
