import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { MossServer } from '@niscorp/moss';
import type { FunctionHandler } from '@niscorp/nova';
import { loginIssue } from '@lyceum/app/vex/login.entries';
import { hashLinkToken, LINK_TTL_MS } from '../login';
import type { SendMail } from '../mail';

// `lectern.request` mails a link only to the speaker's address and answers the
// same either way, so the desk says nothing about which address that is.

export type SpeakerMail = {
  publicUrl: string;
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
