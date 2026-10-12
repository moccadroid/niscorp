import type { Hono } from 'hono';
import type { VerifyReport } from '@niscorp/charter';
import type { ActionDefinition } from '@niscorp/nova';
import type { ScopePolicy } from '@niscorp/vex';
import type { ExecuteAs } from '../data';
import type { IdentityRecord, IdentityReport, ResolvedIdentity } from '../identity';
import type { Catalog } from '../artifactory';
import type { ShellHost } from '../shells';
import type { SocketAccept } from '../socket';

export type Env = { Variables: { principal: string | null; resolved: ResolvedIdentity } };

export type MossServer = Hono<Env> & {
  socket: SocketAccept;
  shells?: ShellHost;
  principalOf: (token: string) => Promise<string | null>;
  page: (path: string) => { name: string; host: ShellHost; inputs: Record<string, Record<string, unknown>> } | undefined;
  pages: readonly { name: string; path: string }[];
  refresh: () => void;
  replaceActions: (source: string, actions: Record<string, ActionDefinition>) => void;
  actions: () => Readonly<Record<string, ActionDefinition>>;
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
