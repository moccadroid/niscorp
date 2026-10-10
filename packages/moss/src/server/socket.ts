import { sessionRemainingMs } from '../identity';
import type { Identity } from '../identity';
import type { RunningManifest } from '../manifest';
import type { NiscRuntime, SessionVerifier } from '../runtime';
import { createSocket } from '../socket';
import type { SocketAccept } from '../socket';
import type { Hosts } from './hosts';

// THE SOCKET (../socket). It speaks for the same principals the HTTP surfaces
// serve — one session verifier, one catalog resolution, one version token.
// When the manifest declares a shell, server shells stand behind it: it is
// handed where a session comes from, for the app and for each page, and
// nothing else of a shell host.
export type SocketParts = {
  runtime: Pick<NiscRuntime, 'pool' | 'session' | 'sessionRevalidateMs' | 'anonymousShellMax' | 'telemetry' | 'origins'>;
  session: SessionVerifier;
  identity: Pick<Identity, 'resolve'>;
  running: Pick<RunningManifest, 'catalogFor'>;
  hosts: Pick<Hosts, 'shells' | 'pageAt'>;
};

export const standSocket = ({ runtime, session, identity, running, hosts }: SocketParts): SocketAccept =>
  createSocket({
    session,
    catalog: async (principal) => {
      const resolved = await identity.resolve(principal);
      return running.catalogFor(resolved.roles, resolved.installed);
    },
    ...(hosts.shells !== undefined ? { shells: hosts.shells } : {}),
    page: hosts.pageAt,
    ...(runtime.sessionRevalidateMs !== undefined ? { revalidateMs: runtime.sessionRevalidateMs } : {}),
    ...(runtime.anonymousShellMax !== undefined ? { anonymousShellMax: runtime.anonymousShellMax } : {}),
    ...(runtime.telemetry !== undefined ? { telemetry: runtime.telemetry } : {}),
    ...(runtime.origins !== undefined ? { origins: runtime.origins } : {}),
    // How long a browser is told to keep the session cookie: known only where
    // the deployment keeps moss's own credential.
    ...(runtime.session === 'sessions' ? { sessionLastsMs: (token: string) => sessionRemainingMs(runtime.pool, token) } : {}),
  });
