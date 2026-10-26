import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { mintSession, sessionCookies } from '@niscorp/moss';
import type { FunctionDefinition, MossServer, NiscApp, NiscRuntime } from '@niscorp/moss';
import { linkIssue, linkRedeem } from '../../app/vex/links.entries';
import { ownerAdmit, personByEmail, personRole } from '../../app/vex/people.entries';
import type { SendMail } from './mail';

export { resendMail } from './mail';
export type { Mail, SendMail } from './mail';

const LINK_MS = 15 * 60 * 1000;
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

const EmailSchema = z.string().trim().toLowerCase().pipe(z.email());
const SignInSchema = z.looseObject({ email: EmailSchema });
const PersonSchema = z.object({ id: z.string(), email: z.string() }).nullish();
const RoleSchema = z.object({ role: z.enum(['owner', 'member']) }).nullish();
const RedeemedSchema = z.union([z.object({ email: z.string() }), z.array(z.object({ email: z.string() }))]).nullish();

const hashOf = (token: string): string => createHash('sha256').update(token).digest('hex');

// Who a principal is: the role on their row in `people`, read as the machine role `identity`. Anybody else is public.
// `inviteeRole` is what the row rule stamps on a person the owner invites.
export const identitySeam: NonNullable<NiscApp['identity']> = {
  as: 'identity',
  resolve: async (principal, read) => {
    const person = RoleSchema.parse(await read(personRole.fingerprint, { userId: principal }));
    return person === null || person === undefined ? { roles: ['public'], scope: {} } : { roles: [person.role], scope: { inviteeRole: 'member' } };
  },
};

export type DoorDeps = {
  pool: NiscRuntime['pool'];
  // The functions are declared before the server exists.
  server: () => MossServer;
  mail: SendMail;
  publicUrl: string;
  owner: string;
};

export type Door = {
  functions: readonly FunctionDefinition[];
  routes: (server: MossServer) => void;
  signIn: (email: string) => Promise<string | null>;
  admitOwner: () => Promise<void>;
};

export const createDoor = ({ pool, server, mail, publicUrl, owner }: DoorDeps): Door => {
  const personOf = async (email: string): Promise<{ id: string; email: string } | undefined> =>
    PersonSchema.parse(await server().executeAs('identity', personByEmail.fingerprint, { email })) ?? undefined;

  // Somebody not invited is answered as somebody invited is, and mailed nothing.
  const request = async (data: unknown): Promise<{ sent: true }> => {
    const asked = SignInSchema.safeParse(data);
    if (!asked.success) throw new Error('That is not an email address.');
    const person = await personOf(asked.data.email);
    if (person === undefined) return { sent: true };
    const token = randomBytes(32).toString('base64url');
    await server().executeAs('gatekeeper', linkIssue.fingerprint, { tokenHash: hashOf(token), email: person.email, expiresAt: new Date(Date.now() + LINK_MS).toISOString() });
    const link = new URL(`/login?token=${token}`, publicUrl).href;
    mail({ to: person.email, subject: 'Your link to sign in to Mira', text: `Open this link to sign in to Mira. It works once, within 15 minutes.\n\n${link}\n\nIf you did not ask for it, ignore this mail.` }).catch(
      (error: unknown) => console.error(`[mail] ${error instanceof Error ? error.message : String(error)}`),
    );
    return { sent: true };
  };

  const redeem = async (token: string): Promise<{ id: string; email: string } | undefined> => {
    const redeemed = RedeemedSchema.parse(await server().executeAs('gatekeeper', linkRedeem.fingerprint, { tokenHash: hashOf(token), now: new Date().toISOString() }));
    const email = Array.isArray(redeemed) ? redeemed[0]?.email : redeemed?.email;
    return email === undefined ? undefined : personOf(email);
  };

  return {
    functions: [{ id: 'signin.request', description: 'Mails a one-time sign-in link to an invited email address. Send { email }; answers { sent: true } whoever it is.', execute: request }],

    routes: (on) => {
      on.get('/login', async (c) => {
        const token = c.req.query('token') ?? '';
        const person = token === '' ? undefined : await redeem(token);
        if (person === undefined) return c.text('This sign-in link was used, or it has expired. Ask Mira for a new one.', 410);
        const session = await mintSession(pool, person.id, SESSION_MS);
        for (const cookie of sessionCookies(c.req.raw, session, { lastsMs: SESSION_MS })) c.header('set-cookie', cookie, { append: true });
        return c.redirect('/');
      });
    },

    signIn: async (email) => {
      const person = await personOf(email.toLowerCase());
      return person === undefined ? null : mintSession(pool, person.id, SESSION_MS);
    },

    admitOwner: async () => {
      if (owner === '') return;
      await server().executeAs('gatekeeper', ownerAdmit.fingerprint, { email: EmailSchema.parse(owner) });
    },
  };
};
