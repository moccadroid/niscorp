import { z } from 'zod';
import type { FunctionSession } from '@niscorp/moss';
import { userById, type Directory } from '@atrium/server/users';
import { modelOf, profileOf, type Profile } from './profiles';

const PersonaRow = z.object({ name: z.string(), character: z.string(), model: z.string(), provider: z.string() }).loose();

export type Persona = z.infer<typeof PersonaRow>;

export type AssistantSession = {
  principal: string | null;
  user: () => Directory | undefined;
  post: (path: string, body: unknown) => Promise<unknown>;
  appendTurn: (role: string, body: string, origin: 'chat' | 'watch') => Promise<unknown>;
  persona: (audience: string) => Promise<Persona>;
  profile: () => Promise<Profile>;
};

type SettingsRow = { layout_control?: string; assistant_model?: string };

export const assistantSession = (session: FunctionSession): AssistantSession => {
  const post = async (path: string, body: unknown): Promise<unknown> => {
    const res = await session.wire(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`${path} → ${res.status}: ${await res.text()}`);
    return res.json();
  };

  const user = () => userById(session.principal);

  // An in-flight dedupe, not a cache: the person can change this row from their
  // own chrome, so a later call reads again.
  let inFlight: Promise<SettingsRow> | undefined;
  const settings = (): Promise<SettingsRow> => {
    if (inFlight !== undefined) return inFlight;
    const reading = post('/api/vex', { fingerprint: 'staff/settings', context: { staffId: session.principal } })
      .then((row) => row as SettingsRow)
      .finally(() => {
        if (inFlight === reading) inFlight = undefined;
      });
    inFlight = reading;
    return reading;
  };

  return {
    principal: session.principal,
    user,
    post,
    appendTurn: (role, body, origin) => post('/api/vex', { fingerprint: 'assistant/append', context: { role, body, origin } }),

    persona: async (audience) => {
      const row = PersonaRow.parse(await post('/api/vex', { fingerprint: 'assistant/persona', context: { audience } }));
      if (session.principal === null) return row;
      try {
        const choice = modelOf((await settings()).assistant_model);
        return choice.provider === '' ? row : { ...row, provider: choice.provider, model: choice.model };
      } catch {
        return row;
      }
    },
    profile: async () => {
      const fallback = profileOf(user()?.layoutControl);
      if (session.principal === null) return fallback;
      try {
        return profileOf((await settings()).layout_control);
      } catch {
        return fallback;
      }
    },
  };
};
