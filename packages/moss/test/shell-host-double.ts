import type { ActionDefinition, FetchFn, LayoutNode } from '@niscorp/nova';
import { shellComponents } from '../src/artifactory/artifacts';
import { actionsWithStoredLayouts, definitionsFor } from '../src/artifactory/roles';
import type { NiscApp, ShellManifest } from '../src/manifest';
import { createShellHost } from '../src/shells';
import type { ShellHost, ShellHostConfig } from '../src/shells';
import type { ShellComposition } from '../src/shells/types';
import type { OwnedShellHost } from '../src/shells/types';

export type HostSetup = {
  app: NiscApp;
  manifest?: ShellManifest;
  actions?: () => Readonly<Record<string, ActionDefinition>>;
  resolve: (principal: string | null) => Promise<{
    roles: readonly string[];
    scope: Record<string, unknown>;
    catalog: { ids: readonly string[]; hash?: string };
    variants: ReadonlyMap<string, LayoutNode>;
  }>;
  wire: (token: string | null) => FetchFn;
  idleMs?: number;
  delta?: boolean;
  endpointTimeoutMs?: number;
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
      const held = actionsWithStoredLayouts(definitionsFor(actions(), who.catalog.ids, who.variants));
      return {
        roles: who.roles,
        scope: who.scope,
        actions: held.actions,
        components: shellComponents({ actions: actions(), layouts: app.layouts }, shell),
        canvases: shell.canvases,
        ...(shell.layout !== undefined ? { frame: shell.layout } : {}),
        layoutStore: { ...shell.layoutStore, ...held.layouts },
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

export const standHost = (config: ShellHostConfig): ShellHost & Pick<OwnedShellHost, 'adopt' | 'stop'> => {
  const { host, adopt, stop } = createShellHost(config);
  return { ...host, adopt, stop };
};
