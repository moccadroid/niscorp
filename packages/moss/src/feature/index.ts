import type { Hono } from 'hono';
import type { Charter } from '@niscorp/charter';
import type { ActionDefinition, FetchFn } from '@niscorp/nova';
import type { Sequence, Upgrader } from '@niscorp/strata';
import type { DocumentStore } from '@niscorp/strata/postgres';
import type { SeedEntry, SeedMutation, WriteEvent } from '@niscorp/vex';
import type { Telemetry } from '../runtime';

export type FeatureEnv = { Variables: { principal: string | null } };

// `installed` undefined: the app keeps no list, and every integration is live.
export type PrincipalIdentity = { roles: readonly string[]; installed: readonly string[] | undefined };

export type CredentialAnswer = { principal: string } | { refused: { status: 401 | 403; error: string; message: string } };

type Actions = Readonly<Record<string, ActionDefinition>>;

export type Replay = (fingerprint: string, context: Record<string, unknown>) => Promise<unknown>;

export type FeatureSeams = {
  mountRoutes: (routes: Hono<FeatureEnv>) => void;
  mountOperatorRoutes: (routes: Hono<FeatureEnv>) => void;
  registerCredential: (prefix: string, principalOf: (token: string, request: Request) => Promise<CredentialAnswer>) => void;

  resolveIdentity: (principal: string | null) => Promise<PrincipalIdentity>;
  scopeOf: (principal: string) => Promise<Record<string, unknown>>;

  grantedActionIds: (roles: readonly string[], installed: readonly string[] | undefined) => readonly string[];
  actions: () => Actions;
  replaceActions: (actions: Record<string, ActionDefinition>) => void;
  refusalOf: (actions: Actions) => string | undefined;
  setActionsLoader: (load: () => Promise<Record<string, ActionDefinition>>) => void;
  addCatalogFilter: (filter: (ids: readonly string[], installed: ReadonlySet<string> | undefined) => readonly string[]) => void;
  charter: Charter;
  components: Readonly<Record<string, { meta?: { description?: string; propsSchema?: unknown } }>>;
  layoutMisfits: (layout: unknown) => string[];
  endlessChains: (actions: Actions) => { path: string; through: readonly string[] }[];

  ownEntries: (entries: readonly (SeedEntry | SeedMutation)[]) => Promise<Replay>;
  grammars: Upgrader;
  upgradeStore: (store: DocumentStore) => Promise<void>;
  fingerprints: () => Promise<readonly string[]>;
  fingerprintsFor: (principal: string | null) => Promise<readonly string[]>;
  onWrite: (listener: (event: WriteEvent, request: { header: (name: string) => string | undefined }) => void) => () => void;

  telemetry: Telemetry | undefined;

  wrapWire: (wrap: (inner: FetchFn) => FetchFn) => void;
};

export type Feature = {
  name: string;
  tables?: {
    names: readonly string[];
    sequences?: readonly Sequence[];
  };
  start: (seams: FeatureSeams) => void | Promise<void>;
};
