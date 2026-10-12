// Resend, over HTTPS: Railway blocks outbound SMTP below its Pro plan.

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
