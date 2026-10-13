import type { Sequence } from '@niscorp/strata';
import type { GenerateDsl, MapToShape, QueryResponse, ScopeBehaviors, SeedEntry, SeedMutation } from '@niscorp/vex';
import type { Charter } from '@niscorp/charter';
import type { ActionDefinition, ActionFragment, CanvasConfig, FetchFn, FunctionHandler, LayoutNode, Shell } from '@niscorp/nova';
import type { PhraseKeys, Phrasebook } from '@niscorp/nova/i18n';
import type { Feature } from '../feature';
import type { IdentityRecord } from '../identity';

export type LayoutVariant = { action: string; layout: LayoutNode };

export type NiscApp = {
  charter: Charter;
  assignments?: Record<string, readonly string[]>;
  wearable?: readonly (readonly string[])[];
  actions: Record<string, ActionDefinition>;
  layouts?: Record<string, LayoutVariant>;
  behaviors?: ScopeBehaviors;
  scope?: (principal: string | null, identity?: IdentityRecord) => Record<string, unknown>;
  identity?: {
    as?: string;
    resolve: (principal: string, read: (fingerprint: string, scope: Record<string, unknown>) => Promise<unknown>) => Promise<IdentityRecord>;
  };
  phrases?: (session: { principal: string | null; identity: Record<string, unknown>; wire: FetchFn }) => Phrasebook | undefined | Promise<Phrasebook | undefined>;
  phraseKeys?: PhraseKeys;
  features?: readonly Feature[];
  entries?: readonly (SeedEntry | SeedMutation)[];
  resources?: Record<string, readonly string[] | { entities: readonly string[] }>;
  shell?: ShellManifest;
  pages?: Record<string, PageManifest>;
  grammars?: readonly Sequence[];
  functions?: (session: FunctionSession) => Record<string, FunctionHandler>;
  // Like `functions`, it runs before the shell finishes building: defer
  // anything that touches `session.shell`.
  onSession?: (session: FunctionSession) => void;
  runs?: RunSink;
  reactions?: readonly {
    table: string;
    op?: 'insert' | 'update' | 'delete';
    run: (
      event: { fingerprint: string; table: string; op: 'insert' | 'update' | 'delete'; count: number; scope: Record<string, unknown> },
      tools: { deliver: (principal: string, channel: string, payload?: unknown) => boolean },
    ) => void;
  }[];
};

export type RunTurn = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  calls?: ReadonlyArray<{ name: string; args: string }>;
  name?: string;
};

export type RunRecord = {
  at: number;
  principal: string | null;
  shellId: string;
  agentId: string;
  agentPath: readonly string[];
  label: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  // False when any step's tokens were counted rather than reported by the provider.
  reported: boolean;
  steps: number;
  elapsedMs: number;
  turns?: readonly RunTurn[];
  response?: string;
  outcome: 'ok' | 'failed';
};

export type RunSink = (record: RunRecord, session: FunctionSession) => void;

export type ArtifactKind = 'layout' | 'action' | 'fragment';

export type ArtifactVersion = {
  kind: ArtifactKind;
  id: string;
  save: string;
  createdAt: string;
  copiedFrom: string | null;
  // `null`: this version says none is in force.
  body: unknown;
};

// What the session's principal saved, and nobody else's: each call reads and
// writes their rows alone.
export type SessionArtifacts = {
  save: (artifacts: readonly { kind: ArtifactKind; id?: string; body: unknown }[]) => Promise<{ save: string; artifacts: readonly { kind: ArtifactKind; id: string }[] }>;
  list: (kind?: ArtifactKind) => Promise<readonly ArtifactVersion[]>;
  history: (kind: ArtifactKind, id: string) => Promise<readonly ArtifactVersion[]>;
  restore: (kind: ArtifactKind, id: string, save: string) => Promise<{ save: string }>;
  reset: (kind: ArtifactKind, id: string) => Promise<{ save: string }>;
};

export type DraftArtifact = { kind: ArtifactKind; id: string; body: unknown };

// What is being generated in this one shell, before it is saved. A put is in
// the shell when it answers. Nothing of it is kept anywhere else, and it is
// gone when the shell is.
export type SessionDraft = {
  put: (artifacts: readonly { kind: ArtifactKind; id?: string; body: unknown }[]) => Promise<{ step: number; artifacts: readonly { kind: ArtifactKind; id: string }[] }>;
  list: () => readonly DraftArtifact[];
  remove: (kind: ArtifactKind, id: string) => Promise<{ step: number }>;
  // `0`: none of it.
  show: (step: number) => Promise<void>;
  discard: () => Promise<void>;
  save: () => Promise<{ save: string; artifacts: readonly { kind: ArtifactKind; id: string }[] }>;
};

export type FunctionSession = {
  // The members that change what a shell is made of (`registerAction`,
  // `setLayout`, `addCanvas` and their kin) throw on this one.
  shell: Shell;
  artifacts: SessionArtifacts;
  draft: SessionDraft;
  principal: string | null;
  roles: readonly string[];
  identity: Record<string, unknown>;
  actions: readonly string[];
  wire: FetchFn;
  grant: (token: string) => void;
  revoke: () => Promise<void>;
  answerIntent: (
    writers: { generateDsl: GenerateDsl; mapToShape: MapToShape },
    asked: { intent: string; shape: unknown; context?: Record<string, unknown> },
  ) => Promise<QueryResponse>;
  recordRun: (run: Omit<RunRecord, 'at' | 'principal' | 'shellId'>) => void;
};

export type CanvasSeed = string | { action: string; input?: Record<string, unknown>; with?: string[] };
// A list of seeds is candidates: only the first action the principal holds mounts.
export type ShellCanvas = Omit<CanvasConfig, 'initial'> & { initial?: CanvasSeed | CanvasSeed[] };

export type ShellManifest = {
  canvases: ShellCanvas[];
  layout?: LayoutNode;
  layoutStore?: Record<string, LayoutNode>;
  fragments?: Record<string, ActionFragment>;
  seeds?: (session: {
    principal: string | null;
    actions: readonly string[];
    roles: readonly string[];
    wire: FetchFn;
  }) => Promise<Record<string, CanvasSeed[]>> | Record<string, CanvasSeed[]>;
  components?: Record<string, { meta?: { description?: string; propsSchema?: unknown } }>;
  inputs?: (session: {
    principal: string | null;
    actions: readonly string[];
    roles: readonly string[];
    identity: Record<string, unknown>;
    wire: FetchFn;
  }) => Record<string, Record<string, unknown>> | Promise<Record<string, Record<string, unknown>>>;
};

export type PageManifest = ShellManifest & {
  path: string;
  // The id of the canvas whose seed receives the path's parameters as input.
  params?: string;
};

export const defineApp = (app: NiscApp): NiscApp => app;

export const actionLayoutRef = (actionId: string): string => `action/${actionId}`;

export const isActionLayoutRef = (name: string): boolean => name.startsWith('action/');

export const actionOfLayoutRef = (ref: string): string | undefined => (isActionLayoutRef(ref) ? ref.slice('action/'.length) : undefined);

// The id of an action or a fragment somebody generated is moss's to give, and
// begins with this. Nothing an app ships or hands over has such an id: the
// charter grants by id, and one an app chose could stand in for a generated one.
export const GENERATED_ID_PREFIX = 'generated.';

export const FRAME_LAYOUT_REF = 'frame';

export const canvasLayoutRef = (canvasId: string): string => `canvas/${canvasId}`;

// Why nothing an app writes has or names this name, where it is one moss keeps a layout under.
export const keptLayoutNameRefusal = (name: string): string | undefined => {
  if (isActionLayoutRef(name)) return 'a name beginning with "action/" is where the layout of that action is kept';
  if (name === FRAME_LAYOUT_REF) return `"${FRAME_LAYOUT_REF}" is where the layout of the shell is kept`;
  if (name.startsWith('canvas/')) return 'a name beginning with "canvas/" is where the layout of that canvas is kept';
  return undefined;
};

export const entriesOf = (app: Pick<NiscApp, 'entries'>): readonly (SeedEntry | SeedMutation)[] => app.entries ?? [];

export const wearableOf = (app: Pick<NiscApp, 'wearable' | 'assignments'>): readonly (readonly string[])[] => {
  const declared = app.wearable;
  const source = declared ?? Object.values(app.assignments ?? {});
  const seen = new Map<string, readonly string[]>();
  for (const roles of source) {
    const key = [...roles].sort().join('\0');
    if (!seen.has(key)) seen.set(key, roles);
  }
  return [...seen.values()];
};
