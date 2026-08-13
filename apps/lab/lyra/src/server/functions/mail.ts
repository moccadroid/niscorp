import type { FunctionHandler } from '@niscorp/nova';
import type { PgPool } from '@niscorp/vex';
import { domainState, registerDomain, senderFor } from '../mail/send';

// ONE QUESTION A SCREEN CANNOT ANSWER FROM ROWS: what address does this
// studio's mail actually leave from? The name and slug are rows; the domain is
// the DEPLOYMENT'S, held in the environment and readable in exactly one file.
// So the settings screen asks, and what it shows is what the transport would
// really put in the From: header — including "not configured", which is the
// answer somebody needs most.
export const mailFunctions = (deps: { pool: PgPool; studioOf: (principal: string | null) => Promise<string> }, principal: string | null): Record<string, FunctionHandler> => ({
  'mail.sender': async () => {
    const studioId = await deps.studioOf(principal);
    if (studioId === '') return '';
    const row = await deps.pool.query('SELECT name, slug FROM studios WHERE id = $1', [studioId]);
    const studio = row.rows[0] as { name?: string; slug?: string } | undefined;
    return studio === undefined ? '' : senderFor(String(studio.name ?? ''), String(studio.slug ?? ''));
  },

  // ── BRING YOUR OWN DOMAIN, in two acts ──────────────────────
  //
  // These call the provider and RETURN what it said. They write nothing: the
  // screen records the answer through vex like every other write in this app,
  // so a domain landing on a studio's row goes through the same scope policy
  // as anything else. A function that both called a vendor and wrote a row
  // would be the one place tenancy is enforced by a comment.
  'mail.addDomain': async (data) => {
    const domain = String((data as Record<string, unknown>)['domain'] ?? '').trim().toLowerCase();
    // A HOSTNAME AND NOTHING ELSE — no scheme, no path, no address. What comes
    // back from this is published in somebody's DNS.
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw new Error('That does not look like a domain — try mail.yourstudio.at');
    const answer = await registerDomain(domain);
    if (!answer.ok) throw new Error(answer.reason);
    return { domain, domainId: answer.id, records: answer.records };
  },

  'mail.checkDomain': async (data) => {
    const id = String((data as Record<string, unknown>)['domainId'] ?? '');
    if (id === '') throw new Error('Add a domain first.');
    const answer = await domainState(id);
    if (!answer.ok) throw new Error(answer.reason);
    return { verified: answer.verified, status: answer.status };
  },
});
