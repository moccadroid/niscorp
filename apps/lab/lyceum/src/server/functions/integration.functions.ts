import { z } from 'zod';
import type { FunctionSession, MossServer } from '@niscorp/moss';
import type { FunctionHandler } from '@niscorp/nova';

// INSTALLING SOMEBODY ELSE'S SCREEN — the controller's Integrations tool
// (app/actions/tools/integrations.action.ts). The QA Company is a third party whose
// bundle is a file on another domain (apps/lab/lyceum-vendor-demo, published on
// GitHub Pages); lyceum knows only its address. Install hands that address to
// moss, which fetches the bundle and runs intake — the answer is what intake
// said, reasons and all. Approve turns it on: every shell is rebuilt, and each
// of the QA Company's screens is on the seat it attached to — the phones, the
// controller, the last slide.
//
// These are moss's operator routes, called in-process with the key this boot
// minted (server/boot.ts); nothing outside the server holds it. Only the
// speaker may call them — and the stage may read where the QA Company stands, for the
// install slide (slide.install), which is told when that changes.

export const VENDOR_ID = 'qa';

// Where the QA Company lives. The published bundle on Pages unless the environment says
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

// Each reason a row, so the tool can list them. `checks` is what the install
// check tests, each marked by how the last install fared (a sigil: check, x, or
// nothing before any install); `culprit` is the trigger a refused loop runs
// through, as it is in the bundle.
export type VendorState = { id: string; url: string; status: string; reasons: { reason: string }[]; checks: { check: string; passed: string | null }[]; culprit: string };
const asRows = (reasons: readonly string[]): { reason: string }[] => reasons.map((reason) => ({ reason }));

// WHAT THE INSTALL CHECK TESTS, and how to tell from its reasons which test a
// bundle failed. The reasons are moss's own sentences (runIntake); a check with
// no reason against it passed — intake reports every fault, not the first.
const CHECKS: readonly { check: string; failedBy: RegExp }[] = [
  { check: 'Only components this app has', failedBy: /component|prop /i },
  { check: 'Only queries this app has', failedBy: /endpoint/i },
  { check: 'Only where this app allows', failedBy: /^(attachment|placement)|namespace/i },
  { check: 'No infinite loops', failedBy: /^a chain of steps that never ends/ },
];
// Marked only when the checks ran: a reason that belongs to none of them (the
// file could not be fetched, it did not parse) means intake stopped before
// them, and nothing here passed or failed.
const checked = (installed: boolean, reasons: readonly string[]): VendorState['checks'] => {
  const ran = installed && reasons.every((reason) => CHECKS.some(({ failedBy }) => failedBy.test(reason)));
  return CHECKS.map(({ check, failedBy }) => ({ check, passed: !ran ? null : reasons.some((reason) => failedBy.test(reason)) ? 'x' : 'check' }));
};

// THE TRIGGER A REFUSED LOOP RUNS THROUGH, read out of the bundle itself: the
// reason names the channel and the action ("qa-echo —emit (ext.member.qa.ask)→ …"),
// and this fetches the file again and prints that action's trigger on that
// channel, as written. Nothing if there is no loop, or the file cannot be read.
const BundleSchema = z.looseObject({ actions: z.record(z.string(), z.looseObject({ triggers: z.array(z.looseObject({ message: z.string().optional() })).optional() })) });
const culpritOf = async (url: string, reasons: readonly string[]): Promise<string> => {
  const loop = /^a chain of steps that never ends: (\S+) —\w+ \(([^)]+)\)→/.exec(reasons.find((reason) => reason.startsWith('a chain of steps')) ?? '');
  const channel = loop?.[1];
  const actionId = loop?.[2];
  if (channel === undefined || actionId === undefined) return '';
  try {
    const bundle = BundleSchema.parse(await (await fetch(`${url}/bundle`)).json());
    const trigger = bundle.actions[actionId]?.triggers?.find((candidate) => candidate.message === channel);
    // One line per key, as the file's author would write it.
    return trigger === undefined ? '' : ['{', ...Object.entries(trigger).map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)},`), '}'].join('\n');
  } catch {
    return '';
  }
};

// Take the QA Company out, whoever asks: the operator's own route, in-process. An
// integration that is not installed is already out.
export const removeVendor = async (server: MossServer, operatorKey: string): Promise<void> => {
  await server.request(`/operator/integrations/${VENDOR_ID}`, { method: 'DELETE', headers: { 'content-type': 'application/json', 'x-operator-key': operatorKey } });
};

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

  // Where the QA Company stands now: its address, moss's status for it (absent → not
  // installed; `pending`; `approved`), and what intake last refused it for.
  const state = async (): Promise<VendorState> => {
    if (session.principal !== 'speaker' && session.principal !== 'stage') throw new Error('Only the speaker and the stage read where the QA Company stands.');
    const res = await server().request('/operator/integrations', { headers: { 'x-operator-key': operatorKey } });
    const row = ListSchema.parse(await res.json()).integrations.find((integration) => integration.id === VENDOR_ID);
    if (row === undefined) return { id: VENDOR_ID, url: addresses.good, status: 'not installed', reasons: [], checks: checked(false, []), culprit: '' };
    // A refused install leaves a row with its reasons and nothing imported.
    const refused = row.lastError !== null && row.actionCount === 0;
    const reasons = row.lastError === null ? [] : row.lastError.split('; ');
    return { id: row.id, url: row.url, status: refused ? 'refused' : row.status, reasons: asRows(reasons), checks: checked(true, reasons), culprit: await culpritOf(row.url, reasons) };
  };

  // ITS SCREENS ON EVERY SEAT, OR GONE FROM THEM. moss folds an approved
  // integration into every living shell as it stands (adopt) — which keeps each
  // screen, and also keeps what was placed when the shell was built: the
  // phone's list, the controller's and the last slide's `attached` canvas
  // (server/attached.ts). So every shell is rebuilt, as the X-ray's grants
  // rebuild the phones (server/reactions.ts): what rides each seat is read
  // again, with the QA Company on it or not.
  const rebuildShells = (): void => {
    for (const shell of server().shells?.list() ?? []) server().invalidateIdentity(shell.principal);
  };
  // The install slide on the projector reads the state again.
  const tellStage = (): void => {
    server().shells?.deliver('stage', 'integration-changed');
  };

  return {
    'integrations.state': state,
    // Fetch, check, and hold as pending — or refuse, saying why.
    'integrations.install': async (data) => {
      const { which } = WhichSchema.parse(data);
      const { ok, answer } = await operator('/integrations', 'POST', { id: VENDOR_ID, url: addresses[which] });
      const now = await state();
      tellStage();
      return { ...now, url: addresses[which], status: ok ? now.status : 'refused' };
    },
    'integrations.approve': async () => {
      await operator(`/integrations/${VENDOR_ID}/approve`, 'POST');
      rebuildShells();
      tellStage();
      return state();
    },
    // For rehearsals: gone again, from every seat.
    'integrations.remove': async () => {
      await operator(`/integrations/${VENDOR_ID}`, 'DELETE');
      rebuildShells();
      tellStage();
      return state();
    },
  };
};
