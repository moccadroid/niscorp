import type { Hono } from 'hono';
import type { VerifyReport } from '@niscorp/charter';
import type { ActionDefinition } from '@niscorp/nova';
import type { ScopePolicy, SeedEntry, SeedMutation } from '@niscorp/vex';
import type { ExecuteAs } from '../data';
import type { IdentityRecord, IdentityReport, ResolvedIdentity } from '../identity';
import type { Catalog } from '../artifactory';
import type { SessionArtifacts } from '../manifest';
import type { ShellHost } from '../shells';
import type { SocketAccept } from '../socket';

export type Env = { Variables: { principal: string | null; resolved: ResolvedIdentity } };

export type MossServer = Hono<Env> & {
  socket: SocketAccept;
  shells?: ShellHost;
  principalOf: (token: string) => Promise<string | null>;
  page: (path: string) => { name: string; host: ShellHost; inputs: Record<string, Record<string, unknown>> } | undefined;
  pages: readonly { name: string; path: string }[];
  // Builds nobody's shell once and drops it, and refuses as the boot does where the
  // functions it was given are wrong. The app calls it once it holds the server and
  // before it listens: a session hook may reach for the server, and it is here that
  // one first runs.
  checkFunctions: () => Promise<void>;
  refresh: () => void;
  replaceActions: (source: string, actions: Record<string, ActionDefinition>) => void;
  replaceEntries: (source: string, entries: readonly (SeedEntry | SeedMutation)[]) => Promise<void>;
  actions: () => Readonly<Record<string, ActionDefinition>>;
  // What is published for everybody, with the calls a session's `artifacts` has.
  // `publisher`: who a publish is made by. No session reaches these rows: only
  // the app's own code on the server calls this, and its charter says who holds
  // the action that does.
  defaults: (publisher: string) => SessionArtifacts;
  catalogOf: (principal: string | null) => Promise<Catalog>;
  policyForRoles: (roles: readonly string[]) => ScopePolicy;
  charterReport: () => VerifyReport;
  invalidateIdentity: (principal: string) => boolean;
  identity: (principal: string | null) => Promise<IdentityRecord>;
  executeAs: ExecuteAs;
  invalidateTag: (tag: string) => number;
  nudge: (principal: string, channel: string) => void;
  close: () => void;
  identities?: { list: () => IdentityReport[]; meter: () => { size: number; max: number; resolved: number; evicted: number; expired: number } };
};
