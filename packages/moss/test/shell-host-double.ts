import type { ActionDefinition, FetchFn, LayoutNode } from '@niscorp/nova';
import { shellComponents } from '../src/manifest/components';
import { definitionsFor } from '../src/manifest/roles';
import type { NiscApp, ShellManifest } from '../src/manifest';
import { createShellHost } from '../src/shells';
import type { OwnedShellHost, ShellComposition, ShellHost, ShellHostConfig } from '../src/shells';

// A SHELL HOST'S CONFIG, ASSEMBLED AS A SERVER ASSEMBLES IT, for the tests that
// stand a host up with no server: from an app, and from who the test says a
// principal is and what they hold.
//
// What a principal's shell is made of is put together from the pieces the
// running manifest answers it from (../src/manifest/running.ts,
// `artifactsFor`): the definitions granted with the layout variant in place
// (`definitionsFor`), the component names (`shellComponents`), the shell as
// its manifest says it, and the entries. It is not the running manifest
// itself, because a test here says what each principal holds, id by id, with
// no charter. A test says who somebody is; it does not say what a composition
// looks like. That a server's hosts ask the running manifest is held in
// server-hosts.test.ts.

export type HostSetup = {
  app: NiscApp;
  // The shell this host builds, when it is a page's. Absent: the app's own.
  manifest?: ShellManifest;
  // The actions in force now. Absent: what the app ships.
  actions?: () => Readonly<Record<string, ActionDefinition>>;
  // Who a principal is and what they hold: roles, scope values, the ids of
  // the actions granted to them, and the layout variant held of each.
  resolve: (principal: string | null) => Promise<{
    roles: readonly string[];
    scope: Record<string, unknown>;
    catalog: { ids: readonly string[]; hash?: string };
    variants: ReadonlyMap<string, LayoutNode>;
  }>;
  wire: (token: string | null) => FetchFn;
  // The three limits, flat: a test names the one it is about.
  idleMs?: number;
  delta?: boolean;
  endpointTimeoutMs?: number;
  // The entries the app serves, by fingerprint. Absent: the composition names
  // none, as for a host that cannot ask.
  entries?: ShellComposition['entries'];
} & Pick<ShellHostConfig, 'kept' | 'wrapWire' | 'answerIntent' | 'revokeSessions' | 'telemetry'>;

export const hostConfig = (setup: HostSetup): ShellHostConfig => {
  const { app } = setup;
  const shell = setup.manifest ?? app.shell;
  if (shell === undefined) throw new Error('hostConfig: the app has no `shell`, and no manifest was named.');
  const actions = setup.actions ?? ((): Readonly<Record<string, ActionDefinition>> => app.actions);
  return {
    composition: async (principal) => {
      const who = await setup.resolve(principal);
      return {
        roles: who.roles,
        scope: who.scope,
        actions: definitionsFor(actions(), who.catalog.ids, who.variants),
        components: shellComponents({ actions: actions(), layouts: app.layouts }, shell),
        canvases: shell.canvases,
        ...(shell.layout !== undefined ? { frame: shell.layout } : {}),
        ...(shell.layoutStore !== undefined ? { layoutStore: shell.layoutStore } : {}),
        ...(shell.fragments !== undefined ? { fragments: shell.fragments } : {}),
        ...(setup.entries !== undefined ? { entries: setup.entries } : {}),
      };
    },
    hooks: {
      ...(shell.inputs !== undefined ? { inputs: shell.inputs } : {}),
      ...(shell.seeds !== undefined ? { seeds: shell.seeds } : {}),
      ...(app.phrases !== undefined ? { phrases: app.phrases } : {}),
      ...(app.functions !== undefined ? { functions: app.functions } : {}),
      ...(app.onSession !== undefined ? { onSession: app.onSession } : {}),
      ...(app.runs !== undefined ? { runs: app.runs } : {}),
    },
    ...(app.phraseKeys !== undefined ? { phraseKeys: app.phraseKeys } : {}),
    ...(setup.kept !== undefined ? { kept: setup.kept } : {}),
    wire: setup.wire,
    ...(setup.wrapWire !== undefined ? { wrapWire: setup.wrapWire } : {}),
    ...(setup.answerIntent !== undefined ? { answerIntent: setup.answerIntent } : {}),
    ...(setup.revokeSessions !== undefined ? { revokeSessions: setup.revokeSessions } : {}),
    ...(setup.telemetry !== undefined ? { telemetry: setup.telemetry } : {}),
    limits: {
      ...(setup.idleMs !== undefined ? { idleMs: setup.idleMs } : {}),
      ...(setup.delta !== undefined ? { delta: setup.delta } : {}),
      ...(setup.endpointTimeoutMs !== undefined ? { endpointTimeoutMs: setup.endpointTimeoutMs } : {}),
    },
  };
};

// A HOST AS A TEST HOLDS ONE: the host a server hands out, with the two things
// only whoever made it does to it on the same object (`adopt` what changed,
// `stop` its sweep), because here the test is whoever made it. The host a
// server hands out has neither (../src/shells/types.ts, `OwnedShellHost`).
export const standHost = (config: ShellHostConfig): ShellHost & Pick<OwnedShellHost, 'adopt' | 'stop'> => {
  const { host, adopt, stop } = createShellHost(config);
  return { ...host, adopt, stop };
};
