import type { FunctionHandler } from '@niscorp/nova';
import type { FunctionSession, MossServer, NiscApp } from '@niscorp/moss';
import type { PgPool } from '@niscorp/vex';
import { everyone, loadDirectory } from '../users';

// THE ACL SEAM — what makes a role change land on somebody else's screen.
//
// Writing `staff.role` changes a row. It does not, on its own, change anybody's
// application: `assignments` maps a principal to their roles, moss resolves the
// charter against that map, and both were computed at boot. Without this, an
// owner promotes somebody and nothing happens until the process restarts.
//
// So this is the other half of the write, and it is deliberately a `fn:` rather
// than a query: re-reading a directory, rebuilding a map and asking the server
// to re-verify is not a database question, and dressing it as one would be a
// lie about what it does (rule 7a).
//
// What it is NOT: a permission grant. It recomputes a mapping from rows that
// already exist. If the charter has nothing to say about a role, resolving it
// produces nothing — and moss refuses to serve an incoherent charter, so a bad
// role fails loudly at refresh rather than quietly at request time.
export const staffFunctions = (
  session: FunctionSession,
  deps: { pool: PgPool; app: NiscApp; server: () => MossServer },
): Record<string, FunctionHandler> => ({
  'staff.refresh': async (data) => {
    await loadDirectory(deps.pool);

    // Rebuild the assignment map IN PLACE. moss resolves from the object the
    // manifest carries, so replacing the reference would leave the server
    // reading the old one.
    for (const key of Object.keys(deps.app.assignments)) delete deps.app.assignments[key];
    for (const person of everyone()) deps.app.assignments[person.id] = [person.audience];

    // Re-verify the charter, drop every per-principal memo, and have living
    // shells adopt their re-resolved definitions.
    const server = deps.server();
    server.refresh();

    // …and then RESET the affected person's shell, which is the half `refresh`
    // deliberately does not do.
    //
    // `adopt` re-registers definitions: what a shell may push changes, and
    // mounted instances keep their state. That is right for a catalog change
    // and wrong for a ROLE change, because a role also changes what was seeded
    // — the landing surface a candidate list chose, and the nav that `inputs`
    // derived. Both were decided when the shell was built, so a promoted
    // instructor would hold the manager's surfaces and still be looking at the
    // instructor's screen.
    //
    // A reset rebuilds from the same derivation boot ran and carries the
    // attached terminals across, so the person sees their new application
    // arrive rather than being signed out of the old one.
    const personId = String(data['pendingPersonId'] ?? '');
    if (personId !== '') server.shells?.reset(personId);

    void session;
    return true;
  },
});
