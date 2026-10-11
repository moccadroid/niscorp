import { sessionRevokerOf, sessionVerifierOf } from '../identity';
import type { Data } from '../data';
import { receiveManifest } from '../manifest';
import type { NiscApp } from '../manifest';
import type { NiscRuntime } from '../runtime';
import { assembleServer } from './assemble';
import { buildData } from './data';
import type { MossServer } from './moss-server';

// ═══════════════════════════════════════════════════════════════
// createServer — the wiring, and nothing else.
//
// The app hands over its ARTIFACTS (../manifest) and an environment
// (../runtime); everything mechanical is derived by the module that owns it.
// This function constructs the modules, hands each the narrow things it
// needs, starts the features and mounts the routes. It answers no question of
// its own: each step is one line and a file beside this one. The first three
// are here; the ones that stand over the data module are ./assemble.ts.
//
// The server refuses to boot incoherent (DESIGN.md § Derivation over
// configuration: coherence is refused, not documented), and each refusal is
// the step's that finds it.
// ═══════════════════════════════════════════════════════════════

// THE BOOT, IN ITS ORDER, over whatever brings the data module up. It is what
// `createServer` does, with the one step that asks a database handed in, for
// the reason `createDataWith` and `assembleServer` are functions of their own: the
// order of these steps can be held with nothing behind it. A manifest that
// does not parse refuses before `dataOf` is called at all.
export const createServerWith = async (app: NiscApp, runtime: NiscRuntime, dataOf: (app: NiscApp, runtime: NiscRuntime) => Promise<Data>): Promise<MossServer> => {
  // 1. WHAT WAS HANDED OVER IS READ FIRST, AND THEN FROZEN (../manifest, the
  // hand-over): nothing below may meet a manifest no schema has read, and
  // nothing after may write one. One that does not parse refuses here, before
  // a table is created or a row is read.
  receiveManifest(app);

  // 2. WHO A TOKEN IS, resolved before anything else boots: an unset verifier
  // refuses HERE, with a sentence, instead of serving every forged principal
  // silently. 'dev-open' announces itself on this line.
  // And how every session a principal holds is forgotten at a sign-out, where
  // the deployment keeps the credential itself.
  const session = sessionVerifierOf(runtime);
  const revokeSessions = sessionRevokerOf(runtime);

  // 3. The tables are migrated and `data` stands (./data.ts).
  const data = await dataOf(app, runtime);

  // 4 to 13. Everything that stands over the data module (./assemble.ts).
  return assembleServer({ app, runtime, session, revokeSessions, data });
};

export const createServer = (app: NiscApp, runtime: NiscRuntime): Promise<MossServer> => createServerWith(app, runtime, buildData);
