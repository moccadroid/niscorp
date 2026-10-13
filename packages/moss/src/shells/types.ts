import type { ActionDefinition, ActionFragment, FetchFn, LayoutNode, RenderNode, Shell } from '@niscorp/nova';
import type { PhraseKeys } from '@niscorp/nova/i18n';
import type { QueryResponse, SeedEntry, SeedMutation } from '@niscorp/vex';
import type { Intent, QueryWriters } from '../data';
import type { ArtifactKind, DraftArtifact, NiscApp, SessionArtifacts, ShellCanvas, ShellManifest } from '../manifest';
import type { Telemetry } from '../runtime';

export type ShellComposition = {
  roles: readonly string[];
  scope: Record<string, unknown>;
  actions: Readonly<Record<string, ActionDefinition>>;
  canvases: readonly ShellCanvas[];
  // The name of the shell's layout in the layout store. With none, nova's own is drawn.
  frame?: string;
  // The canvases the shell's layouts hold a slot for, beside `canvases`.
  slottedCanvases?: readonly string[];
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

// What a shell asks of whoever checks what is put into its draft, and saves it.
export type DraftSaving = {
  put: (artifacts: unknown, drafted: readonly DraftArtifact[]) => Promise<{ drafted: readonly DraftArtifact[]; put: readonly { kind: ArtifactKind; id: string }[] }>;
  save: (drafted: readonly DraftArtifact[]) => Promise<{ save: string; artifacts: readonly { kind: ArtifactKind; id: string }[] }>;
};

export type ShellHostConfig = {
  // `drafted`: what the draft of the shell this is asked for holds.
  composition: (principal: string | null, drafted?: readonly DraftArtifact[]) => Promise<ShellComposition>;
  hooks: ShellHooks;
  phraseKeys?: PhraseKeys;
  kept?: boolean;
  wire: (token: string | null) => FetchFn;
  wrapWire?: (inner: FetchFn) => FetchFn;
  answerIntent?: (principal: string | null, writers: QueryWriters, asked: Intent) => Promise<QueryResponse>;
  artifacts?: (principal: string | null) => SessionArtifacts;
  draftSaving?: (principal: string | null) => DraftSaving;
  revokeSessions?: (principal: string) => Promise<void>;
  telemetry?: Telemetry;
  limits?: ShellLimits;
};

export type ShellConnection = {
  send: (text: string) => void;
  close: (code?: number, reason?: string) => void;
  seal?: (token: string) => Promise<string>;
};

export type ShellSession = {
  readonly shell: Shell;
  attach: (connection: ShellConnection, options?: { delta?: boolean }) => void;
  detach: (connection: ShellConnection) => void;
  resync: (connection: ShellConnection) => void;
  dispatch: (canvas: string, event: Record<string, unknown>) => void;
  publish: (channel: string, payload?: unknown) => void;
  back: () => boolean;
  popTo: (canvas: string, instance: string) => void;
  reset: () => void;
};

export type ShellReport = {
  principal: string;
  connections: number;
  since: number;
  idleSince: number | null;
  canvases: { id: string; actions: readonly string[] }[];
};

export type ShellSnapshot = {
  frame: RenderNode[];
  trees: Record<string, RenderNode[]>;
  seed?: string;
  settled: boolean;
  live: boolean;
  why: string[];
  drawnWith: string[];
};

export type ShellOpening = {
  seed?: string;
  inputs?: Record<string, Record<string, unknown>>;
};

export type ShellHost = {
  session: (token: string | null, principal: string | null, options?: ShellOpening) => Promise<ShellSession>;
  snapshot: (token: string | null, principal: string | null, options?: { waitMs?: number; inputs?: ShellOpening['inputs'] }) => Promise<ShellSnapshot>;
  deliver: (principal: string, channel: string, payload?: unknown) => boolean;
  list: () => ShellReport[];
  reset: (principal: string) => boolean;
};

export type OwnedShellHost = {
  host: ShellHost;
  adopt: () => void;
  adoptFor: (principal: string) => void;
  stop: () => void;
};
