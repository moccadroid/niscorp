import type { ActionDefinition, ActionFragment, FetchFn, LayoutNode } from '@niscorp/nova';
import type { PhraseKeys } from '@niscorp/nova/i18n';
import type { QueryResponse, SeedEntry, SeedMutation } from '@niscorp/vex';
import type { Intent, QueryWriters } from '../data';
import type { NiscApp, ShellCanvas, ShellManifest } from '../manifest';
import type { Telemetry } from '../runtime';

export type ShellComposition = {
  roles: readonly string[];
  scope: Record<string, unknown>;
  actions: Readonly<Record<string, ActionDefinition>>;
  canvases: readonly ShellCanvas[];
  frame?: LayoutNode;
  layoutStore?: Readonly<Record<string, LayoutNode>>;
  fragments?: Readonly<Record<string, ActionFragment>>;
  entries?: ReadonlyMap<string, SeedEntry | SeedMutation>;
  components: Readonly<Record<string, ComponentContract>>;
};

export type ComponentContract = NonNullable<ShellManifest['components']>[string];

export type ShellHooks = {
  inputs?: ShellManifest['inputs'];
  seeds?: ShellManifest['seeds'];
  phrases?: NiscApp['phrases'];
  functions?: NiscApp['functions'];
  onSession?: NiscApp['onSession'];
  runs?: NiscApp['runs'];
};

export type ShellLimits = {
  // `0` or `Infinity` disables the sweep.
  idleMs?: number;
  delta?: boolean;
  // Also how long the build of a shell may take.
  endpointTimeoutMs?: number;
};

export type ShellHostConfig = {
  composition: (principal: string | null) => Promise<ShellComposition>;
  hooks: ShellHooks;
  phraseKeys?: PhraseKeys;
  kept?: boolean;
  wire: (token: string | null) => FetchFn;
  wrapWire?: (inner: FetchFn) => FetchFn;
  answerIntent?: (principal: string | null, writers: QueryWriters, asked: Intent) => Promise<QueryResponse>;
  revokeSessions?: (principal: string) => Promise<void>;
  telemetry?: Telemetry;
  limits?: ShellLimits;
};
