import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { MossServer } from '@niscorp/moss';
import type { FunctionHandler } from '@niscorp/nova';
import { loginIssue } from '@lyceum/app/vex/login.entries';
import { hashLinkToken, LINK_TTL_MS } from '../login';
import type { SendMail } from '../mail';

// THE SPEAKER'S SIGN-IN DESK (actions/lectern/) — asking for a link. A
// function for what cannot be data: an outside call (the mail). It mails a
// one-time link if the address is the speaker's — only the one address the
// deployment names (LYCEUM_SPEAKER_EMAIL) ever gets one — and answers the same
// either way, so the desk says nothing about which address that is. The link
// is stored as the `gatekeeper` machinery role: nobody is signed in yet.

export type SpeakerMail = {
  publicUrl: string;
  // The speaker's address. Empty: nobody can ask for a link, only `pnpm mint`.
  speakerEmail: string;
  send: SendMail;
};

const AskedSchema = z.object({ email: z.string() });
const normal = (email: string): string => email.trim().toLowerCase();

export const lecternFunctions = (server: () => MossServer, mail: SpeakerMail): Record<string, FunctionHandler> => ({
  'lectern.request': async (data) => {
    const asked = AskedSchema.safeParse(data);
    const email = asked.success ? normal(asked.data.email) : '';
    if (mail.speakerEmail !== '' && email === normal(mail.speakerEmail)) {
      const token = randomBytes(32).toString('base64url');
      await server().executeAs('gatekeeper', loginIssue.fingerprint, {
        tokenHash: hashLinkToken(token),
        principal: 'speaker',
        expiresAt: new Date(Date.now() + LINK_TTL_MS).toISOString(),
      });
      await mail
        .send({
          to: email,
          subject: 'Your Lyceum sign-in link',
          text: `Sign in as the speaker:\n\n${mail.publicUrl.replace(/\/$/, '')}/login?token=${token}\n\nThe link works once, within 15 minutes.`,
        })
        .catch((error: unknown) => console.error('[lyceum] the speaker\'s sign-in link was not sent:', error));
    }
    return { asked: true };
  },
});
