// THE ONE FILE THAT KNOWS WHO SENDS THE MAIL — Resend, over HTTPS (Railway
// blocks outbound SMTP below its Pro plan). It sends one thing: the speaker's
// sign-in link (./login.ts). Without RESEND_API_KEY there is no mail at all,
// and the message is printed to the server log instead — dev, and a deploy
// that has not been given a key yet.
//
//   RESEND_API_KEY   the Resend API key
//   MAIL_FROM        the sender, on a domain verified in Resend — defaults to
//                    `Lyceum <no-reply@<PUBLIC_URL's host>>`

export type Mail = { to: string; subject: string; text: string };
export type SendMail = (mail: Mail) => Promise<void>;

export const createMailer = (env: Record<string, string | undefined>, publicUrl: string): SendMail => {
  const key = env['RESEND_API_KEY'] ?? '';
  const from = env['MAIL_FROM'] ?? `Lyceum <no-reply@${new URL(publicUrl).hostname}>`;
  if (key === '') {
    return async (mail) => {
      console.log(`[lyceum] no RESEND_API_KEY — the mail to ${mail.to} is not sent:\n${mail.subject}\n${mail.text}`);
    };
  }
  return async (mail) => {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text }),
    });
    if (!response.ok) throw new Error(`mail to ${mail.to} refused (${response.status}): ${(await response.text()).slice(0, 200)}`);
  };
};
