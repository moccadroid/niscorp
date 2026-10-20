import { z } from 'zod';
import type { FunctionDefinition, FunctionSession, MossServer } from '@niscorp/moss';

export const VENDOR_ID = 'qa';

export type VendorAddresses = { good: string; broken: string };
export const vendorAddresses = (env: Record<string, string | undefined>): VendorAddresses => ({
  good: env['LYCEUM_VENDOR_URL'] ?? 'https://moccadroid.github.io/niscorp/vendor',
  broken: env['LYCEUM_VENDOR_BROKEN_URL'] ?? 'https://moccadroid.github.io/niscorp/vendor-broken',
});

const ListSchema = z.object({ integrations: z.array(z.looseObject({ id: z.string(), url: z.string(), status: z.string(), lastError: z.string().nullable(), actionCount: z.number() })) });
const AnswerSchema = z.looseObject({ message: z.string().optional(), reasons: z.array(z.string()).optional(), status: z.string().optional() });
const WhichSchema = z.object({ which: z.enum(['good', 'broken']) });

export type VendorState = { id: string; url: string; status: string; reasons: { reason: string }[]; checks: { check: string; passed: string | null }[]; culprit: string };
const asRows = (reasons: readonly string[]): { reason: string }[] => reasons.map((reason) => ({ reason }));

// `failedBy` matches the reason sentences of moss's intake and of this app's
// own: reworded there, a fault is marked against no check.
const CHECKS: readonly { check: string; failedBy: RegExp }[] = [
  { check: 'Only components this app has', failedBy: /component|prop /i },
  { check: 'Only queries this app has', failedBy: /endpoint/i },
  { check: 'Only where this app allows', failedBy: /^(attachment|placement)|namespace/i },
  { check: 'No infinite loops', failedBy: /^a chain of steps that never ends/ },
];
// A reason that belongs to none of the checks (the file could not be fetched,
// it did not parse) means intake stopped before them: nothing passed or failed.
const checked = (installed: boolean, reasons: readonly string[]): VendorState['checks'] => {
  const ran = installed && reasons.every((reason) => CHECKS.some(({ failedBy }) => failedBy.test(reason)));
  return CHECKS.map(({ check, failedBy }) => ({ check, passed: !ran ? null : reasons.some((reason) => failedBy.test(reason)) ? 'x' : 'check' }));
};

const BundleSchema = z.looseObject({ actions: z.record(z.string(), z.looseObject({ triggers: z.array(z.looseObject({ message: z.string().optional() })).optional() })) });
const culpritOf = async (url: string, reasons: readonly string[]): Promise<string> => {
  const loop = /^a chain of steps that never ends: (\S+) —\w+ \(([^)]+)\)→/.exec(reasons.find((reason) => reason.startsWith('a chain of steps')) ?? '');
  const channel = loop?.[1];
  const actionId = loop?.[2];
  if (channel === undefined || actionId === undefined) return '';
  try {
    const bundle = BundleSchema.parse(await (await fetch(`${url}/bundle`)).json());
    const trigger = bundle.actions[actionId]?.triggers?.find((candidate) => candidate.message === channel);
    return trigger === undefined ? '' : ['{', ...Object.entries(trigger).map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)},`), '}'].join('\n');
  } catch {
    return '';
  }
};

export const removeVendor = async (server: MossServer, operatorKey: string): Promise<void> => {
  await server.request(`/operator/integrations/${VENDOR_ID}`, { method: 'DELETE', headers: { 'content-type': 'application/json', 'x-operator-key': operatorKey } });
};

export const integrationFunctions = (session: FunctionSession, server: () => MossServer, operatorKey: string, addresses: VendorAddresses): FunctionDefinition[] => {
  const operator = async (path: string, method: string, body?: unknown): Promise<{ ok: boolean; answer: z.infer<typeof AnswerSchema> }> => {
    if (session.principal !== 'speaker') throw new Error('Only the speaker installs integrations.');
    const res = await server().request(`/operator${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'x-operator-key': operatorKey },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { ok: res.ok, answer: AnswerSchema.parse(await res.json()) };
  };

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

  // Moss folds an approved integration into every living shell as it stands,
  // which keeps what was placed when the shell was built (the phone's list, the
  // `attached` canvases): so every shell is rebuilt.
  const rebuildShells = (): void => {
    for (const shell of server().shells?.list() ?? []) server().invalidateIdentity(shell.principal);
  };
  const tellStage = (): void => {
    server().shells?.deliver('stage', 'integration-changed');
  };

  return [
    {
      id: 'integrations.state',
      description: 'Answers where the QA Company’s integration stands: its address, its status, why it was refused, which checks it passed, and the trigger behind a loop. The speaker and the stage only. Send nothing.',
      execute: state,
    },
    {
      id: 'integrations.install',
      description: 'Installs the QA Company’s integration from its good or its broken address. The speaker only. Send { which: "good" | "broken" }; answers where it stands.',
      execute: async (data) => {
        const { which } = WhichSchema.parse(data);
        const { ok, answer } = await operator('/integrations', 'POST', { id: VENDOR_ID, url: addresses[which] });
        const now = await state();
        tellStage();
        return { ...now, url: addresses[which], status: ok ? now.status : 'refused' };
      },
    },
    {
      id: 'integrations.approve',
      description: 'Approves the installed QA Company integration, and every shell is built again with its actions. The speaker only. Send nothing; answers where it stands.',
      execute: async () => {
        await operator(`/integrations/${VENDOR_ID}/approve`, 'POST');
        rebuildShells();
        tellStage();
        return state();
      },
    },
    {
      id: 'integrations.remove',
      description: 'Removes the QA Company’s integration, and every shell is built again without it. The speaker only. Send nothing; answers where it stands.',
      execute: async () => {
        await operator(`/integrations/${VENDOR_ID}`, 'DELETE');
        rebuildShells();
        tellStage();
        return state();
      },
    },
  ];
};
