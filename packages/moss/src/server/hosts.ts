import type { FetchFn } from '@niscorp/nova';
import type { Hono } from 'hono';
import { VEX_LIVE_ENV } from '@niscorp/vex/hono';
import type { RunningManifest, SavedRows } from '../artifactory';
import { createWireFollower } from '../data';
import type { Data } from '../data';
import { createPageRouter } from '../documents';
import type { Identity } from '../identity';
import type { NiscApp, ShellManifest } from '../manifest';
import type { NiscRuntime } from '../runtime';
import { createShellHost } from '../shells';
import type { ShellHost, ShellHostConfig } from '../shells';
import type { Env, MossServer } from './moss-server';

export type ShellHostsDeps = {
  app: Pick<NiscApp, 'shell' | 'pages' | 'phrases' | 'functions' | 'onSession' | 'runs' | 'phraseKeys'>;
  runtime: Pick<NiscRuntime, 'telemetry' | 'shellIdleMs' | 'shellFrameDelta' | 'endpointTimeoutMs'>;
  identity: Pick<Identity, 'resolve' | 'composeScope'>;
  running: Pick<RunningManifest, 'artifactsFor' | 'sessionArtifacts'>;
  // What was saved, as the caller whose scope it is handed.
  savedAs: (scope: Record<string, unknown>) => SavedRows;
  data: Pick<Data, 'answerIntent'>;
  wire: (token: string | null) => FetchFn;
  wrapWire: (inner: FetchFn) => FetchFn;
  revokeSessions: ((principal: string) => Promise<void>) | undefined;
};

export type Hosts = {
  shells: ShellHost | undefined;
  pageAt: MossServer['page'];
  pages: MossServer['pages'];
  adopt: () => void;
  adoptFor: (principal: string) => void;
  reset: (principal: string) => boolean;
  deliver: (principal: string, channel: string, payload?: unknown) => boolean;
  stop: () => void;
};

const hostConfig = (deps: ShellHostsDeps, shell: ShellManifest, kept: boolean): ShellHostConfig => {
  const { app, runtime, identity, running, data } = deps;
  const callerOf = async (principal: string | null) => {
    const resolved = await identity.resolve(principal);
    return { resolved, roles: resolved.roles, installed: resolved.installed, saved: deps.savedAs(identity.composeScope(principal, resolved)) };
  };
  return {
    composition: async (principal) => {
      const { resolved, saved, ...held } = await callerOf(principal);
      // Nobody signed in has no rows of their own: they share one `userId`.
      const who = { principal, ...held, ...(principal === null ? {} : { saved }) };
      return { roles: resolved.roles, scope: resolved.scope, ...(await running.artifactsFor(shell, who)) };
    },
    artifacts: (principal) => running.sessionArtifacts(principal, () => callerOf(principal)),
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
    wire: deps.wire,
    wrapWire: deps.wrapWire,
    answerIntent: async (principal, writers, asked) => {
      const resolved = await identity.resolve(principal);
      return data.answerIntent(writers, asked, resolved, identity.composeScope(principal, resolved));
    },
    ...(deps.revokeSessions !== undefined ? { revokeSessions: deps.revokeSessions } : {}),
    ...(runtime.telemetry !== undefined ? { telemetry: runtime.telemetry } : {}),
    limits: {
      ...(runtime.shellIdleMs !== undefined ? { idleMs: runtime.shellIdleMs } : {}),
      ...(runtime.shellFrameDelta !== undefined ? { delta: runtime.shellFrameDelta } : {}),
      ...(runtime.endpointTimeoutMs !== undefined ? { endpointTimeoutMs: runtime.endpointTimeoutMs } : {}),
    },
  };
};

export const buildShellHosts = (deps: ShellHostsDeps): Hosts => {
  const { app } = deps;
  const pageManifests = app.pages ?? {};
  // The router refuses two pages that could answer one path. It is made before
  // any host: a host starts its idle sweep when it is made, and a refusal after
  // that would leave the sweep running.
  const pageRouter = createPageRouter(pageManifests);
  const shells = app.shell !== undefined ? createShellHost(hostConfig(deps, app.shell, true)) : undefined;
  const pageHosts = new Map(Object.entries(pageManifests).map(([name, manifest]) => [name, createShellHost(hostConfig(deps, manifest, false))]));
  const owned = [...(shells !== undefined ? [shells] : []), ...pageHosts.values()];
  const every = owned.map((made) => made.host);

  return {
    shells: shells?.host,
    pageAt: (path) => {
      const matched = pageRouter.match(path);
      if (matched === undefined) return undefined;
      const host = pageHosts.get(matched.name)?.host;
      const manifest = pageManifests[matched.name];
      if (host === undefined || manifest === undefined) return undefined;
      return { name: matched.name, host, inputs: manifest.params === undefined ? {} : { [manifest.params]: matched.params } };
    },
    pages: Object.entries(pageManifests).map(([name, manifest]) => ({ name, path: manifest.path })),
    adopt: () => {
      for (const made of owned) made.adopt();
    },
    adoptFor: (principal) => {
      for (const made of owned) made.adoptFor(principal);
    },
    // `map`, not `some`: each host is asked, whatever the one before answered.
    reset: (principal) => every.map((host) => host.reset(principal)).includes(true),
    deliver: (principal, channel, payload) => every.map((host) => host.deliver(principal, channel, payload)).includes(true),
    stop: () => {
      for (const made of owned) made.stop();
    },
  };
};

export const createInternalWire =
  (server: Hono<Env>) =>
  (token: string | null): FetchFn =>
  async (url, init) => {
    const isVex = url.split('?')[0]?.endsWith('/vex') === true;
    // A vex read whose caller can say when to stop (a signal) may keep
    // answering. The follower rides the in-process request's env, where no
    // network request can put one.
    const follower = isVex && init?.signal !== undefined ? createWireFollower(init.signal) : undefined;
    const res = await server.request(
      url,
      {
        method: init?.method ?? 'GET',
        headers: { ...(init?.headers ?? {}), ...(token !== null ? { Authorization: `Bearer ${token}` } : {}) },
        ...(init?.body !== undefined ? { body: init.body } : {}),
      },
      follower === undefined ? undefined : { [VEX_LIVE_ENV]: follower.live },
    );
    if (!isVex || !res.ok) {
      follower?.end();
      return res;
    }
    const body: unknown = await res.json();
    const result = body !== null && typeof body === 'object' && 'result' in body ? body.result : body;
    follower?.handedOver();
    return {
      ok: res.ok,
      status: res.status,
      json: () => Promise.resolve(result),
      text: () => Promise.resolve(JSON.stringify(result)),
      ...(follower === undefined ? {} : { onChange: follower.onChange }),
    };
  };
