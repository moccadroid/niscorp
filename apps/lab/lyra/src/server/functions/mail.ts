import type { FunctionHandler } from '@niscorp/nova';
import type { FunctionSession } from '@niscorp/moss';
import { domainState, registerDomain, senderFor } from '../mail/send';

export const mailFunctions = (session: FunctionSession): Record<string, FunctionHandler> => ({
  'mail.sender': async () => {
    const response = await session.wire('/api/vex', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fingerprint: 'studio/current', context: {} }) });
    if (!response.ok) return '';
    const studio = (await response.json()) as { name?: unknown; slug?: unknown } | null;
    if (studio === null || typeof studio !== 'object') return '';
    return senderFor(String(studio.name ?? ''), String(studio.slug ?? ''));
  },

  // The domain functions return what the provider said and write nothing: the
  // screen records it through vex, under the scope policy of every other write.
  'mail.addDomain': async (data) => {
    const domain = String((data as Record<string, unknown>)['domain'] ?? '').trim().toLowerCase();
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
