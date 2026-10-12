import type { FunctionHandler } from '@niscorp/nova';
import type { FunctionSession, MossServer, NiscApp } from '@niscorp/moss';
import { readEntry } from '@lyra/app/app';

const SOURCE_LOCALE = 'en';

const autonym = (language: string): string => {
  try {
    return new Intl.DisplayNames([language], { type: 'language' }).of(language) ?? language;
  } catch {
    return language;
  }
};

export const worldFunctions = (
  session: FunctionSession,
  deps: {
    app: NiscApp;
    server: () => MossServer;
  },
): Record<string, FunctionHandler> => ({
  'world.refresh': async (data) => {

    const server = deps.server();
    // `refresh` keeps mounted instances, and a role change also changes what was
    // seeded (the landing surface and the nav): hence the reset below.
    server.refresh();

    const personId = String(data['pendingPersonId'] ?? '');
    if (personId !== '') server.shells?.reset(personId);

    void session;
    return true;
  },

  'world.languages': async () => {
    const raw = await readEntry(session.wire, 'phrases/locales', {});
    const loaded = Array.isArray(raw) ? raw.map(String) : [];
    const offered = [SOURCE_LOCALE, ...loaded.filter((language) => language !== SOURCE_LOCALE)];
    return offered.map((language) => ({ value: language, label: autonym(language) }));
  },

  'world.relanguage': async () => {
    const raw = await readEntry(session.wire, 'phrases/locales', {});
    const reloaded = Array.isArray(raw) ? raw.length : 0;

    const studioId = String(session.identity['studioId'] ?? '');
    if (studioId === '') return { locales: 0, shells: 0 };

    // Before the resets: the locale rides on the identity record, which moss
    // caches per principal, and `reset` rebuilds a shell from the cache.
    deps.server().invalidateTag(studioId);

    let rebuilt = 0;
    const failed: string[] = [];
    for (const live of deps.server().shells?.list() ?? []) {
      try {
        const record = await deps.server().identity(live.principal);
        if (String(record.scope['studioId'] ?? '') !== studioId) continue;
        if (deps.server().shells?.reset(live.principal) === true) rebuilt += 1;
      } catch (error) {
        failed.push(live.principal);
        console.error('[lyra:relanguage] could not re-language a shell:', live.principal, error);
      }
    }
    return { phrases: reloaded, shells: rebuilt, failed: failed.length };
  },
});
