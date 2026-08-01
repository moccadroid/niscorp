import { z } from 'zod';
import type { FunctionSession } from '@niscorp/moss';
import { userById, type Directory } from '@atrium/server/users';
import { modelOf, profileOf, type Profile } from './profiles';

// What every path needs from a session: a governed POST, a turn row, the persona
// and the profile. Built once from the session's own wire, so every read and
// write below is under the caller's policy — there is no second, more powerful
// client anywhere in the assistant.

const PersonaRow = z.object({ name: z.string(), character: z.string(), model: z.string(), provider: z.string() }).loose();

export type Persona = z.infer<typeof PersonaRow>;

export type AssistantSession = {
  principal: string | null;
  user: () => Directory | undefined;
  post: (path: string, body: unknown) => Promise<unknown>;
  // `origin` says which way in produced the turn: 'chat' when a person asked,
  // 'watch' when nobody did. Only chat turns are the conversation.
  appendTurn: (role: string, body: string, origin: 'chat' | 'watch') => Promise<unknown>;
  // The persona row for an audience, with this person's own model choice laid
  // over it when they have made one. The choice is a key, not a model id — see
  // MODELS in profiles.ts.
  persona: (audience: string) => Promise<Persona>;
  // Read per call, not held from login: the row is one the person owns and can
  // change from their own chrome, and a setting that waits for the next sign-in
  // is one people learn not to trust.
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

  // `persona` and `profile` want the same row and a run asks for them together.
  // This is an IN-FLIGHT DEDUPE, not a cache: two calls in the same breath share
  // one read, and a later call reads again. The row is one the person changes
  // from their own chrome, so holding it would reintroduce exactly the staleness
  // `profile` was written to avoid.
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
        // The house default names no provider, and that is what leaves the
        // persona row in charge. An override replaces BOTH halves or neither —
        // a model id without its provider is not a thing that can be called.
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
