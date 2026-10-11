import type { Hono } from 'hono';
import type { VerifyReport } from '@niscorp/charter';
import type { ActionDefinition } from '@niscorp/nova';
import type { ScopePolicy } from '@niscorp/vex';
import type { ExecuteAs } from '../data';
import type { IdentityRecord, IdentityReport, ResolvedIdentity } from '../identity';
import type { Catalog, ManifestReport } from '../manifest';
import type { ShellHost } from '../shells';
import type { SocketAccept } from '../socket';

// What a request carries once the authentication has run (./authenticate.ts):
// who is calling, and who that is.
export type Env = { Variables: { principal: string | null; resolved: ResolvedIdentity } };

// The composed app — hono (so a host mounts, extends or listens with any
// runtime adapter; it's the escape hatch for classic routing, too) plus
// the socket's accept, which the runtime's transport feeds new
// connections (see ./node.ts, attachSocket).
export type MossServer = Hono<Env> & {
  socket: SocketAccept;
  shells?: ShellHost;
  // WHO A TOKEN IS — the deployment's own verifier, the one every surface here
  // already asks. For an app's own route that receives a credential some other
  // way than a Bearer header (a page request carries a cookie): null is a
  // refusal, exactly as it is everywhere else.
  principalOf: (token: string) => Promise<string | null>;
  // THE PAGE A PATH LEADS TO (../manifest, app.ts § pages) — its name, the host that draws
  // it, and the input its path carries — or undefined for a path that is the
  // app's. The document route and the socket ask the same question here, so a
  // page is drawn and then served by one answer.
  page: (path: string) => { name: string; host: ShellHost; inputs: Record<string, Record<string, unknown>> } | undefined;
  // Every page the manifest declares, by name, with the path it is drawn at —
  // what a build walks to know which paths exist besides the app's own.
  pages: readonly { name: string; path: string }[];
  // Something the server derived its answers from changed where it cannot see
  // (a role, an install): verify what is in force again, drop every
  // per-principal memo, and have every living shell adopt its re-resolved
  // definitions: the ones kept for a signed-in principal, the ones built for
  // nobody signed in, and the ones each page built. It ships nothing: what the
  // app consists of changes through `replaceActions`, and the manifest it
  // handed over cannot be edited.
  refresh: () => void;
  // HAND OVER A SET OF ACTIONS THAT ARRIVED WHILE THE APP RUNS — for an app
  // that loads actions from its own rows. `source` names the set: handing the
  // same name over again puts the new set in place of the old, so an action it
  // no longer names leaves. What the app would then consist of is verified
  // first. Refused, this throws with the sentence `refresh` throws and nothing
  // changed; accepted, it does what `refresh` does in this process, and the
  // set is frozen where it stands: to change it, hand over another. The
  // actions in force are what the app shipped, then each set.
  //
  // A SET HAS ONE WRITER. Each feature the app names keeps a set of its own
  // under its own name (`'integrations'`: the approved integrations' actions,
  // read from its tables), and only that feature replaces it. Handing a set
  // over under a feature's name throws, saying whose it is.
  //
  // THE SET IS HANDED TO THIS PROCESS, AND NO OTHER PROCESS IS HANDED IT. The
  // call moves the generation pointer, and another process that follows it
  // reads again the sets it has a loader for, drops what it derived and has
  // its shells adopt. A set that arrived here and nowhere else it cannot
  // read: it goes on serving the set of this name it was last handed itself.
  // An app that runs several processes keeps the set in rows and names how it
  // is read, in a feature of its own (`FeatureSeams.setActionsLoader`), or
  // calls this in each process.
  replaceActions: (source: string, actions: Record<string, ActionDefinition>) => void;
  // WOULD THAT SET BE TAKEN — the dry run of `replaceActions`: the same
  // verification over the same candidate, answered as a report, and nothing is
  // changed. `errors` empty: `replaceActions` would accept it. Otherwise each
  // error names the check that refuses and why: `actions` (a definition nova
  // does not read), `charter`, `reach`, `variants`. For a set that is a
  // feature's it throws, as `replaceActions` does: it is not the caller's to
  // hand over.
  verifyActions: (source: string, actions: Record<string, ActionDefinition>) => ManifestReport;
  // THE ACTIONS IN FORCE NOW, by id: what the app shipped, then each set that
  // was handed over. To read, never to write: a set changes through
  // `replaceActions`.
  actions: () => Readonly<Record<string, ActionDefinition>>;
  // WHAT SOMEBODY HOLDS of the actions in force: the granted ids, sorted, and
  // the version token of that set (equal hash, equal application). It
  // resolves who the principal is the way a request does (`null` is nobody
  // signed in), installs included. The one way to ask: a second, by roles and
  // an install list the caller wrote down, answered for somebody no request
  // was ever served as.
  catalogOf: (principal: string | null) => Promise<Catalog>;
  // WHAT A SET OF ROLES MAY READ AND WRITE: the vex policy a request by
  // somebody holding exactly these roles is served under, compiled from the
  // charter and the row behaviors over every table the database has. One
  // policy per role, merged. For a check or a tool that reads the rules: no
  // query runs, and the answer is compiled for the asking, so it is the
  // caller's own and not the one a request is served under.
  policyForRoles: (roles: readonly string[]) => ScopePolicy;
  // THE REPORT THIS SERVER WAS VERIFIED BY — `verifyCharter`'s, from boot, then
  // from each change that passed. Boot and refresh read its `errors` and
  // nothing else, so the rest was computed and dropped: the warnings (an action
  // no role grants, an allow that matches nothing) and each role's closure
  // issues. Nothing here prints them; a host that wants them reads them — over
  // the universes boot resolved against, which it cannot rebuild without the
  // database. `errors` is always empty: a report with one never got this far.
  charterReport: () => VerifyReport;
  // ONE PERSON'S identity, forgotten — for a change that concerns them and
  // nobody else (their role moved, their tenant installed an integration).
  // Every living shell of theirs is rebuilt: the one the app keeps for them,
  // and the one a page built for each connection of theirs. `false` if
  // they were not held, which is an answer rather than an error. `refresh()`
  // above is the deployment-wide hammer; this is the scalpel, and a tenant-local
  // write should reach for it rather than dropping every principal's record.
  invalidateIdentity: (principal: string) => boolean;
  // The resolved record for one principal — the app reading back what its own
  // seam and entries produced, through the same cache the request path uses.
  // Not an enumerator: one principal in, one record out.
  identity: (principal: string | null) => Promise<IdentityRecord>;
  // Execute a seeded entry as a declared charter role — for surfaces that have
  // no principal by nature. In-process, replay-only, charter-bounded; see
  // ../data, execute-as.ts.
  executeAs: ExecuteAs;
  // FORGET ONE TENANT, not the deployment. The application tags each identity
  // record it resolves (`IdentityRecord.tag`); this drops every record wearing
  // one and answers how many it held. Moss never interprets the tag.
  //
  // This is what makes a tenant-local write tenant-local. `refresh()` is still
  // the right hammer for a changed ARTIFACT, because artifacts are deployment
  // -wide; a tenant installing an integration is not.
  invalidateTenant: (tag: string) => number;
  // TELL ONE PRINCIPAL'S SCREENS THAT A CHANNEL CHANGED — every living shell
  // of theirs: the one the app keeps for them, and the one a page built for
  // each connection they have to it; in this process, and over the fabric in
  // every other. Each is published to payload-less, so what is mounted and
  // listening reads again under its own policy. Payload-less by the row-less
  // doctrine — a nudge says a channel changed, never what to. It answers
  // nothing: whether they are looking is not known across processes.
  //
  // THE ONE WAY FOR A SERVER TO SAY IT. `shells.deliver` is another thing:
  // it puts a message WITH A PAYLOAD into the shell the app's own host keeps
  // for somebody, in this process and no other, and answers whether there was
  // one. A reaction's `deliver` is this nudge, carrying its payload to the
  // shells that live here.
  nudge: (principal: string, channel: string) => void;
  // The generation this process has followed. It moves when any process calls
  // `refresh` or `replaceActions`; every process, within one poll of it, reads
  // again the sets of actions it has a loader for and drops what it derived.
  // Two processes at one generation have followed the same moves. They serve
  // the same actions only where every set reached both: one handed to a single
  // process with no loader did not.
  generation: () => number;
  // RETIRE EVERYTHING THIS SERVER STARTED that outlives a request — the
  // generation poll, the identity idle sweep, the socket's revalidation, the
  // shell idle sweep. ONE call, because the alternative is what leaked: a host
  // retiring a runtime IN-PROCESS (a dev floor rebuilding on a server-file
  // edit) had to enumerate moss's timers by reaching into each handle, and
  // could only ever stop the ones it could see — the poller and the identity
  // sweep were never surfaced, so a rebuild left them polling an ended pool.
  // The thing that started a timer owns stopping it; the host calls this and
  // learns nothing about how many there are. A deployment that boots ONCE
  // needs none of this: nothing retires it in-process, and every timer here is
  // `unref`'d, so the process carries them off on its own exit.
  close: () => void;
  // Every identity resident right now, and what the cache is costing —
  // structural facts only, on the shell-roster model. Absent when the app
  // declares no `identity` seam.
  identities?: { list: () => IdentityReport[]; meter: () => { size: number; max: number; resolved: number; evicted: number; expired: number } };
};
