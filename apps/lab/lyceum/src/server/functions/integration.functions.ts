import { z } from 'zod';
import type { FunctionSession, MossServer } from '@niscorp/moss';
import type { FunctionHandler } from '@niscorp/nova';

// INSTALLING SOMEBODY ELSE'S SCREEN — the controller's Integrations tool
// (app/actions/tools/integrations.action.ts). Acme is a third party whose
// bundle is a file on another domain (apps/lab/lyceum-vendor-demo, published on
// GitHub Pages); lyceum knows only its address. Install hands that address to
// moss, which fetches the bundle and runs intake — the answer is what intake
// said, reasons and all. Approve turns it on: every shell is rebuilt, and each
// of Acme's screens is on the seat it attached to — the phones, the
// controller, the last slide.
//
// These are moss's operator routes, called in-process with the key this boot
// minted (server/boot.ts); nothing outside the server holds it. Only the
// speaker may call them.

export const VENDOR_ID = 'acme';

// Where Acme lives. The published bundle on Pages unless the environment says
// otherwise — a rehearsal on a network that cannot reach GitHub points it at
// any other copy of the same file.
export type VendorAddresses = { good: string; broken: string };
export const vendorAddresses = (env: Record<string, string | undefined>): VendorAddresses => ({
  good: env['LYCEUM_VENDOR_URL'] ?? 'https://moccadroid.github.io/niscorp/vendor',
  broken: env['LYCEUM_VENDOR_BROKEN_URL'] ?? 'https://moccadroid.github.io/niscorp/vendor-broken',
});

const ListSchema = z.object({ integrations: z.array(z.looseObject({ id: z.string(), url: z.string(), status: z.string(), lastError: z.string().nullable(), actionCount: z.number() })) });
const AnswerSchema = z.looseObject({ message: z.string().optional(), reasons: z.array(z.string()).optional(), status: z.string().optional() });
const WhichSchema = z.object({ which: z.enum(['good', 'broken']) });

// Each reason a row, so the tool can list them.
export type VendorState = { id: string; url: string; status: string; reasons: { reason: string }[] };
const asRows = (reasons: readonly string[]): { reason: string }[] => reasons.map((reason) => ({ reason }));

export const integrationFunctions = (session: FunctionSession, server: () => MossServer, operatorKey: string, addresses: VendorAddresses): Record<string, FunctionHandler> => {
  const operator = async (path: string, method: string, body?: unknown): Promise<{ ok: boolean; answer: z.infer<typeof AnswerSchema> }> => {
    if (session.principal !== 'speaker') throw new Error('Only the speaker installs integrations.');
    const res = await server().request(`/operator${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'x-operator-key': operatorKey },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { ok: res.ok, answer: AnswerSchema.parse(await res.json()) };
  };

  // Where Acme stands now: its address, moss's status for it (absent → not
  // installed; `pending`; `approved`), and what intake last refused it for.
  const state = async (): Promise<VendorState> => {
    if (session.principal !== 'speaker') throw new Error('Only the speaker installs integrations.');
    const res = await server().request('/operator/integrations', { headers: { 'x-operator-key': operatorKey } });
    const row = ListSchema.parse(await res.json()).integrations.find((integration) => integration.id === VENDOR_ID);
    if (row === undefined) return { id: VENDOR_ID, url: addresses.good, status: 'not installed', reasons: [] };
    // A refused install leaves a row with its reasons and nothing imported.
    const refused = row.lastError !== null && row.actionCount === 0;
    return { id: row.id, url: row.url, status: refused ? 'refused' : row.status, reasons: asRows(row.lastError === null ? [] : row.lastError.split('; ')) };
  };

  // ITS SCREENS ON EVERY SEAT, OR GONE FROM THEM. moss folds an approved
  // integration into every living shell as it stands (adopt) — which keeps each
  // screen, and also keeps what was placed when the shell was built: the
  // phone's list, the controller's and the last slide's `attached` canvas
  // (server/attached.ts). So every shell is rebuilt, as the X-ray's grants
  // rebuild the phones (server/reactions.ts): what rides each seat is read
  // again, with Acme on it or not.
  const rebuildShells = (): void => {
    for (const shell of server().shells?.list() ?? []) server().invalidateIdentity(shell.principal);
  };

  return {
    'integrations.state': state,
    // Fetch, check, and hold as pending — or refuse, saying why.
    'integrations.install': async (data) => {
      const { which } = WhichSchema.parse(data);
      const { ok, answer } = await operator('/integrations', 'POST', { id: VENDOR_ID, url: addresses[which] });
      const now = await state();
      return { ...now, url: addresses[which], status: ok ? now.status : 'refused', reasons: asRows(answer.reasons ?? (ok ? [] : [answer.message ?? 'refused'])) };
    },
    'integrations.approve': async () => {
      await operator(`/integrations/${VENDOR_ID}/approve`, 'POST');
      rebuildShells();
      return state();
    },
    // For rehearsals: gone again, from every seat.
    'integrations.remove': async () => {
      await operator(`/integrations/${VENDOR_ID}`, 'DELETE');
      rebuildShells();
      return state();
    },
  };
};
