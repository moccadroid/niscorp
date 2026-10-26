export type Mail = { to: string; subject: string; text: string };
export type SendMail = (mail: Mail) => Promise<void>;

// Resend, over HTTPS. Without a key the mail is written to the server's log, link and all.
export const resendMail = (key: string, from: string): SendMail => {
  if (key === '') return async (mail) => console.log(`[mail] no RESEND_API_KEY, so the mail to ${mail.to} is not sent:\n${mail.subject}\n${mail.text}`);
  return async (mail) => {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text }),
    });
    if (!response.ok) throw new Error(`Resend refused the mail to ${mail.to} (${response.status}): ${(await response.text()).slice(0, 200)}`);
  };
};
