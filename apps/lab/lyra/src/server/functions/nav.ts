import type { FunctionHandler } from '@niscorp/nova';
import type { FunctionSession, MossServer } from '@niscorp/moss';
import type { Integrations } from '@niscorp/moss/integrations';
import { contextFor } from '@lyra/app/nav/sections';
import { pathOnService } from '@lyra/app/integration-extension';
import type { IntegrationExtension } from '@lyra/app/integration-extension';
import { bookOverWire } from '@lyra/app/app';
import { greetingFrom } from '../phrases';
import { dayIn } from '../clock';

export const navFunctions = (
  session: FunctionSession,
  deps: { server: () => MossServer; integrations: Integrations<IntegrationExtension>; attachable: Readonly<Record<string, Readonly<Record<string, string>>>> },
): Record<string, FunctionHandler> => {
  const approved = async (): Promise<{ integration: string; extension: IntegrationExtension }[]> =>
    (await deps.integrations.listIntegrations()).flatMap(({ id, status, extension }) => (status === 'approved' && extension !== undefined ? [{ integration: id, extension }] : []));

  const titleOf = (actionId: string): string => deps.server().actions()[actionId]?.title ?? actionId;

  // `session.actions` is what the shell was built with; an integration landing
  // mid-session grants ids without a rebuild, and `/catalog` answers current.
  const grantedNow = async (): Promise<readonly string[]> => {
    const response = await session.wire('/catalog', {});
    if (!response.ok) return session.actions;
    const body = (await response.json()) as { actions?: unknown };
    return Array.isArray(body.actions) ? body.actions.map(String) : session.actions;
  };

  return {
  // A function rather than an entry because a member holds no `people.read`:
  // a parent sees their child's name without the rung gaining that verb.
  'nav.family': async () => (session.principal === null ? [] : Array.isArray(session.identity['household']) ? session.identity['household'] : []),

  'nav.identity': async () => {
    if (session.principal === null) return {};
    const name = String(session.identity['name'] ?? '');
    return {
      studioName: String(session.identity['studioName'] ?? ''),
      personName: name,
      greeting: greetingFrom(await bookOverWire(session.wire, String(session.identity['locale'] ?? '')), name, new Date()),
    };
  },
  'reports.window': async (data) => {
    const timezone = String(session.identity['timezone'] ?? '');
    if (timezone === '') return {};
    const to = dayIn(timezone);
    const days = Number(data['days'] ?? 90);
    const from = new Date(`${to}T00:00:00Z`);
    from.setUTCDate(from.getUTCDate() - days);
    return {
      from: from.toISOString().slice(0, 10),
      to,
      label: days === 30 ? 'Last 30 days' : days === 365 ? 'Last 12 months' : `Last ${days} days`,
    };
  },
  'nav.context': async (data) => {
    const action = String(data['currentLeaf'] ?? '');
    const granted = await grantedNow();
    const context = contextFor(action, granted);
    if (context.areaId === '') return { areaId: action, areaLabel: '', tabs: [], moreValue: '' };

    const placements: Record<string, string> = Object.assign({}, ...(await approved()).map(({ extension }) => extension.placements));
    const placed = granted
      .filter((id) => placements[id] === context.areaId)
      .map((id) => ({ action: id, label: titleOf(id), icon: 'addons' }))
      .sort((a, b) => a.label.localeCompare(b.label));

    const tabs = [...context.tabs, ...placed];
    return {
      areaId: context.areaId,
      areaLabel: context.areaLabel,
      tabs: tabs.length > 1 ? tabs.map((t) => ({ value: t.action, label: t.label })) : [],
      moreValue: (((data['primaryAreas'] ?? []) as { areaId?: string }[]).some((a) => a.areaId === context.areaId) ? '' : context.areaId),
    };
  },

  'nav.attachments': async (data) => {
    const host = String(data['hostId'] ?? '');
    if (host === '') return [];
    const granted = await grantedNow();
    const attached = (await approved())
      .flatMap(({ integration, extension }) => Object.entries(extension.attachments).map(([actionId, binding]) => ({ integration, actionId, ...binding })))
      .filter((binding) => binding.to === host)
      .sort((a, b) => (a.actionId < b.actionId ? -1 : a.actionId > b.actionId ? 1 : 0));

    const offers = deps.attachable[host] ?? {};
    const offered: Record<string, unknown> = {};
    for (const [key, path] of Object.entries(offers)) {
      offered[key] = path.split('.').reduce<unknown>((at, segment) => (at !== null && typeof at === 'object' ? (at as Record<string, unknown>)[segment] : undefined), data);
    }

    return Promise.all(
      attached
        .filter(({ actionId }) => granted.includes(actionId))
        .map(async ({ integration, actionId, preview }) => {
          const row: Record<string, unknown> = { action: actionId, label: titleOf(actionId), bands: [], hint: '' };
          if (preview === '' || session.principal === null) return row;
          try {
            const res = await deps.integrations.callIntegration(integration, pathOnService(integration, preview), { principal: session.principal, body: offered });
            if (res.ok) {
              const atoms = (await res.json()) as { bands?: unknown; hint?: unknown };
              if (Array.isArray(atoms.bands)) row['bands'] = atoms.bands;
              if (typeof atoms.hint === 'string') row['hint'] = atoms.hint;
            }
          } catch {
            /* an integration that is down costs its preview, nothing else */
          }
          return row;
        }),
    );
  },

};
};
