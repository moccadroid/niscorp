import { Hono } from 'hono';
import { database } from './db';
import type { PackDb } from './db';
import { readIdentity } from './identity';
import type { Identity } from './identity';

// ═══════════════════════════════════════════════════════════════
// THE PACK CONTRACT — what one integration is, in one process.
//
// This service used to be a single Hono app with literal per-prefix routes:
// `app.post('/belts/roster')` nine times, `identity(c, 'belts')` nine times, one
// module-level array of state, one env var. That shape has exactly one bug in
// it, and it is the same bug every time — a call site that says the wrong name,
// or forgets, and reads somebody else's identity or somebody else's rows.
//
// So a pack no longer names itself at every call site. It is MOUNTED, once, and
// everything that could have been misspelled is derived from the mounting:
//
//   THE AUDIENCE IS THE PACK ID. `ctx.identity(c)` already knows which pack it
//   is asking for, so a token minted for another one cannot be read here even
//   by a handler that never thought about it.
//
//   ROUTES ARE RELATIVE. A pack mounts `/roster`, never `/belts/roster`. The
//   prefix is applied once, here, so a pack cannot serve itself at somebody
//   else's address.
//
//   ENV IS DECLARED AND FENCED. A pack asks for names; asking for one it did
//   not declare throws rather than answering. `STRIPE_SECRET` is unreachable
//   from a pack that never named it — not by convention, by the accessor.
//
//   HOOKS ARE A DIFFERENT ROUTER, and are handed a context with NO identity
//   function at all. The host mints no assertion on that path, so identity is
//   not merely absent there — it is untypeable, and a hook handler cannot
//   accidentally believe it has a caller.
//
// A pack owns its own storage and imports no other pack. Nothing enforces the
// second in TypeScript, so a check does (separation-check).
// ═══════════════════════════════════════════════════════════════

/** Read the deployment's env — but only the names this pack declared. */
export type PackEnv = (name: string) => string;

/**
 * This service's database, or nothing when none is configured.
 *
 * ONE DATABASE, ONE TABLE PREFIX PER PACK. `table('accounts')` in the stripe
 * pack is `stripe_accounts`, and there is no way to spell it otherwise from
 * here — which is the point, because prefixes are the whole boundary between
 * two packs' data and a convention would not keep one.
 */
export type PackStore = PackDb & { table: (name: string) => string };

/** What a pack's authenticated routes are handed. */
export type PackContext = {
  id: string;
  /** The caller, verified — with this pack's own id as the audience. */
  identity: (c: { req: { header: (name: string) => string | undefined } }) => Identity | undefined;
  env: PackEnv;
  /** Undefined with no DATABASE_URL — a pack that needs one says so at boot. */
  db: PackStore | undefined;
};

/**
 * What a pack's HOOK routes are handed. Deliberately WITHOUT `identity`: the
 * host forwards a vendor's call with no principal and no assertion, so there is
 * nobody to be. A hook authenticates its caller against the vendor's signature,
 * using a secret from `env`, or it refuses.
 */
export type HookContext = { id: string; env: PackEnv; db: PackStore | undefined };

export type Pack = {
  /** The URL prefix AND the assertion audience. One string, both jobs. */
  id: string;
  /** Served at `GET /<id>/bundle`. Open, because the host fetches it before any key exists. */
  bundle: () => unknown;
  /** Environment names this pack may read. Anything else throws. */
  env?: readonly string[];
  /** Authenticated routes, mounted under `/<id>/`. */
  mount: (router: Hono, ctx: PackContext) => void;
  /** Unauthenticated vendor callbacks, mounted under `/<id>/hook/`. */
  hooks?: (router: Hono, ctx: HookContext) => void;
};

// The prefix is APPLIED here, not asked for. A pack names 'accounts' and gets
// 'stripe_accounts'; it cannot name another pack's table without writing the
// prefix out by hand, which is exactly what pack-check looks for.
const storeFor = (pack: Pack): PackStore | undefined => {
  const db = database();
  if (db === undefined) return undefined;
  return { query: db.query, table: (name) => `${pack.id}_${name}` };
};

const envFor = (pack: Pack): PackEnv => {
  const declared = new Set(pack.env ?? []);
  return (name) => {
    // A typo here is a pack silently behaving as if a secret were unset, which
    // looks like a configuration problem for as long as anybody is willing to
    // look. It is a programming error, so it reads like one.
    if (!declared.has(name)) {
      throw new Error(`pack "${pack.id}" read env "${name}" without declaring it — add it to the pack's env list`);
    }
    return process.env[name] ?? '';
  };
};

export const mountPack = (app: Hono, pack: Pack): void => {
  const env = envFor(pack);
  const db = storeFor(pack);
  const router = new Hono();

  // A THROW ANSWERS IN SENTENCES. The contract requires a pack's error
  // responses to carry a `message` — the host's screens print it, and its
  // fallback is a bare status code a studio owner cannot act on. Wrapped
  // here, once, so a pack cannot forget: the throw's own words go out,
  // stamped with who is speaking.
  router.onError((err, c) => c.json({ message: `The ${pack.id} add-on hit a problem: ${err.message}` }, 500));

  // OPEN, and it has to be: the host fetches this at registration, before the
  // deployment's verify key has ever reached this environment.
  router.get('/bundle', (c) => c.json(pack.bundle() as Record<string, unknown>));

  // Hooks FIRST, on their own router, so a pack's own `/hook/...` route cannot
  // shadow the unauthenticated one or vice versa.
  if (pack.hooks !== undefined) {
    const hooks = new Hono();
    pack.hooks(hooks, { id: pack.id, env, db });
    router.route('/hook', hooks);
  }

  pack.mount(router, { id: pack.id, identity: (c) => readIdentity(c, pack.id), env, db });
  app.route(`/${pack.id}`, router);
};
