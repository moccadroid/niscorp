import type { FunctionHandler } from '@niscorp/nova';
import type { FunctionSession, MossServer, NiscApp } from '@niscorp/moss';
import { readEntry } from '@lyra/app/app';

// THE LANGUAGE THE APPLICATION IS WRITTEN IN. Every layout literal, every
// action title, every display word a read manufactures is this, and the
// `phrases` table says what each of them reads as elsewhere. It is a constant
// rather than a row because it is not a preference — it is a property of the
// source, and changing it means retranslating the source.
const SOURCE_LOCALE = 'en-GB';

// WORDS ARE PER LANGUAGE; FORMATTING IS PER REGION. The phrase table is keyed
// `de` because Vienna and Hamburg read the same sentences — but they do not
// write the same numbers (`€ 45,00` against `45,00 €`), and that half never
// comes from the table at all, it comes from `Intl` given the full tag.
//
// So one book yields several offers. Seeding three near-identical copies of
// 450 rows to make the picker work would be the alternative, and the first
// wording fix would then have to land in three places.
const REGIONS: Record<string, readonly string[]> = {
  de: ['de-AT', 'de-DE', 'de-CH'],
};

const autonym = (locale: string): string => {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(locale) ?? locale;
  } catch {
    // An unknown tag prints itself. Ugly and findable beats blank.
    return locale;
  }
};

// THE ONE RESYNC. Rows changed under the server's boot-time derivations — the
// directory, the role assignments, the resolved charters, the seeded shells —
// and this puts the world back in agreement with them. It used to exist once
// per domain (staff.refresh here, half of addons.apply in nav.ts); the addons
// half now rides `onMutation` in app.ts, and the roster keeps this function
// only because a ROLE change must also rebuild one specific person's shell,
// and only the screen knows whose.
export const worldFunctions = (
  session: FunctionSession,
  deps: {
    app: NiscApp;
    server: () => MossServer;
  },
): Record<string, FunctionHandler> => ({
  'world.refresh': async (data) => {

    // NO MAP TO REBUILD. Roles come from the identity seam, one principal at a
    // time, so a role change is a forgetting rather than a re-derivation — and
    // `refresh` below does the forgetting for everybody. What used to be here
    // was the population walked once more, on every role change, in every
    // process that happened to serve one.

    // Re-verify the charter, drop every per-principal memo, and have living
    // shells adopt their re-resolved definitions.
    const server = deps.server();
    // `refresh` re-registers definitions but keeps mounted instances, which is
    // wrong for a ROLE change: a role also changes what was SEEDED — the landing
    // surface and the nav. Hence the reset below, or a promoted instructor holds
    // the manager's surfaces and is still looking at the instructor's screen.
    server.refresh();

    const personId = String(data['pendingPersonId'] ?? '');
    if (personId !== '') server.shells?.reset(personId);

    void session;
    return true;
  },

  // THE STUDIO'S LANGUAGE CHANGED. The write itself is an ordinary vex mutation
  // (`studio/set-language`), engine-scoped like every other; this is its
  // CONSEQUENCE, which no write can express: the words a shell wears are read
  // when the shell is built, so wearing different ones means being built again.
  //
  // A rebuild, not a `refresh()`. Refresh re-registers definitions in place and
  // keeps mounted instances — right for a changed artifact, wrong here, because
  // `inputs` composed the greeting, the nav labels and the identity card in the
  // old language and only a rebuild re-derives them.
  //
  // WHOSE shells: every person at the caller's own studio, read from the
  // directory. The studio is taken from the SESSION, never from the request —
  // the same rule the write follows, so neither half can be pointed at somebody
  // else's tenant.
  // WHICH LANGUAGES THIS DEPLOYMENT CAN SPEAK: the source language it was
  // authored in, plus every language rows exist for. The source is not in the
  // `phrases` table and never will be — nothing about it needs translating —
  // so a query over that table alone would offer a studio every language
  // except the one it is currently reading, which is the one it needs most.
  //
  // Each language is named IN ITSELF. Somebody who has landed in a language
  // they cannot read has to be able to find the way out, and the word "German"
  // is no help to them; "Deutsch" is.
  'world.languages': async () => {
    // Which languages rows exist for — `phrases/locales`, over the session's
    // own wire like every other read a screen makes.
    const raw = await readEntry(session.wire, 'phrases/locales', {});
    const loaded = Array.isArray(raw) ? raw.map(String) : [];
    const offered = [SOURCE_LOCALE, ...loaded.flatMap((language) => REGIONS[language] ?? [language])];
    // `{ value, label }` because that is the shape the Select primitive takes —
    // the endpoint answers in the kit's vocabulary rather than making the
    // screen reshape it, which would be a transform with one caller.
    return offered.map((locale) => ({ value: locale, label: autonym(locale) }));
  },

  'world.relanguage': async () => {
    // Nothing to reload: the words are read when a shell is built.
    const raw = await readEntry(session.wire, 'phrases/locales', {});
    const reloaded = Array.isArray(raw) ? raw.length : 0;

    const studioId = String(session.identity['studioId'] ?? '');
    if (studioId === '') return { locales: 0, shells: 0 };

    // Only a LIVE shell can be wearing the old words, so the roster moss
    // already keeps is the honest set to walk. WHOSE studio each live shell
    // belongs to is read off the records moss resolved — the app reading back
    // what its own seam produced, one principal at a time.
    let rebuilt = 0;
    for (const live of deps.server().shells?.list() ?? []) {
      const record = await deps.server().identity(live.principal);
      if (String(record.scope['studioId'] ?? '') !== studioId) continue;
      if (deps.server().shells?.reset(live.principal) === true) rebuilt += 1;
    }
    // Reported rather than silent: "nothing happened" and "nobody was connected"
    // look identical from the screen otherwise.
    return { phrases: reloaded, shells: rebuilt };
  },
});
