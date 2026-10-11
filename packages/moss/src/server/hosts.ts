import type { FetchFn } from '@niscorp/nova';
import type { Data } from '../data';
import { createPageRouter } from '../documents';
import type { Identity } from '../identity';
import type { NiscApp, RunningManifest, ShellManifest } from '../manifest';
import type { NiscRuntime } from '../runtime';
import { createShellHost } from '../shells';
import type { ShellHost, ShellHostConfig } from '../shells';
import type { MossServer } from './moss-server';

// ═══════════════════════════════════════════════════════════════
// THE SHELL HOSTS: the app's, when the manifest declares a shell, and one for
// each page.
//
// WHAT A SHELL HOST IS HANDED (../shells, config.ts), for the app's host and
// for every page's: each member one function or one value of the module that
// owns it. What differs between them is the shell manifest a host is for, and
// whether what it builds is kept. Of that manifest this file reads the two
// hooks (`inputs`, `seeds`) and a page's path; what a shell is made of it asks
// the running manifest.
// ═══════════════════════════════════════════════════════════════

export type HostParts = {
  app: Pick<NiscApp, 'shell' | 'pages' | 'phrases' | 'functions' | 'onSession' | 'runs' | 'phraseKeys'>;
  runtime: Pick<NiscRuntime, 'telemetry' | 'shellIdleMs' | 'shellFrameDelta' | 'endpointTimeoutMs'>;
  identity: Pick<Identity, 'resolve' | 'composeScope'>;
  running: Pick<RunningManifest, 'artifactsFor'>;
  data: Pick<Data, 'answerIntent'>;
  // The internal wire, for a session's token (./wire.ts).
  wire: (token: string | null) => FetchFn;
  // What the features laid around the wire a session's screens call through.
  wrapWire: (inner: FetchFn) => FetchFn;
  // How every session a principal holds is forgotten, where the deployment
  // keeps the credential itself.
  revokeSessions: ((principal: string) => Promise<void>) | undefined;
};

export type Hosts = {
  // The app's own host. Undefined: the manifest declares no shell.
  shells: ShellHost | undefined;
  // The page a path leads to, and every page by name (`MossServer`).
  pageAt: MossServer['page'];
  pages: MossServer['pages'];
  // WHAT THE APP CONSISTS OF CHANGED: every host has its living shells adopt,
  // the app's own and each page's (../shells, `ShellHost.adopt`). A page
  // somebody has open is a living shell like any other.
  adopt: () => void;
  // Reset every living shell of one principal, in every host: the one the
  // app's host keeps for them, and each one a page built for a connection of
  // theirs. `false`: they hold none anywhere.
  reset: (principal: string) => boolean;
  // Stop every host's idle sweep.
  stop: () => void;
};

const hostConfig = (parts: HostParts, shell: ShellManifest, kept: boolean): ShellHostConfig => {
  const { app, runtime, identity, running, data } = parts;
  return {
    // WHAT A PRINCIPAL'S SHELL IS MADE OF: who they are (../identity), and
    // everything of the shell that somebody authored, for the roles they hold
    // (../manifest, `artifactsFor`): the actions, the frame and the layout
    // store, the fragments, the entries. THE RUNNING MANIFEST IS ASKED, AND
    // NOTHING IS READ HERE: this file hands it the shell manifest a host is
    // for and passes on what it answers. It reads no action, layout, fragment
    // or entry off the app or off that manifest itself.
    //
    // ONE resolution, awaited, for each build and each adopt. The record is
    // resolved again each time, because a shell is the long-lived thing here:
    // an identity resolved before the tenant installed an integration would
    // leave a shell without that integration's screens for the life of the
    // session.
    composition: async (principal) => {
      const resolved = await identity.resolve(principal);
      return { roles: resolved.roles, scope: resolved.scope, ...running.artifactsFor(shell, resolved.roles, resolved.installed) };
    },
    // The app's code a shell calls: the two derivations of this shell's own
    // manifest, and the four seams of the app's.
    hooks: {
      ...(shell.inputs !== undefined ? { inputs: shell.inputs } : {}),
      ...(shell.seeds !== undefined ? { seeds: shell.seeds } : {}),
      ...(app.phrases !== undefined ? { phrases: app.phrases } : {}),
      ...(app.functions !== undefined ? { functions: app.functions } : {}),
      ...(app.onSession !== undefined ? { onSession: app.onSession } : {}),
      ...(app.runs !== undefined ? { runs: app.runs } : {}),
    },
    ...(app.phraseKeys !== undefined ? { phraseKeys: app.phraseKeys } : {}),
    kept,
    wire: parts.wire,
    wrapWire: parts.wrapWire,
    // Asked by a session for its own principal. Who that is, is resolved
    // again here: the policy and the scope values are the ones a request
    // of theirs would be served under now.
    answerIntent: async (principal, writers, asked) => {
      const resolved = await identity.resolve(principal);
      return data.answerIntent(writers, asked, resolved, identity.composeScope(principal, resolved));
    },
    ...(parts.revokeSessions !== undefined ? { revokeSessions: parts.revokeSessions } : {}),
    ...(runtime.telemetry !== undefined ? { telemetry: runtime.telemetry } : {}),
    limits: {
      ...(runtime.shellIdleMs !== undefined ? { idleMs: runtime.shellIdleMs } : {}),
      ...(runtime.shellFrameDelta !== undefined ? { delta: runtime.shellFrameDelta } : {}),
      ...(runtime.endpointTimeoutMs !== undefined ? { endpointTimeoutMs: runtime.endpointTimeoutMs } : {}),
    },
  };
};

export const buildShellHosts = (parts: HostParts): Hosts => {
  const { app } = parts;
  // PAGES: a host each, built from the page's own manifest and keeping nothing
  // (../manifest, app.ts § pages). The router refuses two pages that could
  // answer one path, here, at boot — like every other incoherence. BEFORE ANY
  // HOST IS MADE: a host starts its idle sweep when it is made, and a refusal
  // after the app's own was made left that sweep running with nothing to stop
  // it by.
  const pageManifests = app.pages ?? {};
  const pageRouter = createPageRouter(pageManifests);
  const shells = app.shell !== undefined ? createShellHost(hostConfig(parts, app.shell, true)) : undefined;
  const pageHosts = new Map(Object.entries(pageManifests).map(([name, manifest]) => [name, createShellHost(hostConfig(parts, manifest, false))]));
  // Every host there is. What is asked of "every living shell" is asked of
  // each of these, never of the app's own alone.
  const every = [...(shells !== undefined ? [shells] : []), ...pageHosts.values()];

  return {
    shells,
    pageAt: (path) => {
      const matched = pageRouter.match(path);
      if (matched === undefined) return undefined;
      const host = pageHosts.get(matched.name);
      const manifest = pageManifests[matched.name];
      if (host === undefined || manifest === undefined) return undefined;
      return { name: matched.name, host, inputs: manifest.params === undefined ? {} : { [manifest.params]: matched.params } };
    },
    pages: Object.entries(pageManifests).map(([name, manifest]) => ({ name, path: manifest.path })),
    adopt: () => {
      for (const host of every) host.adopt();
    },
    // Each host is asked, whatever the one before it answered.
    reset: (principal) => every.map((host) => host.reset(principal)).includes(true),
    stop: () => {
      for (const host of every) host.stop();
    },
  };
};
