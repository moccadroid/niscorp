import { listAttachments, listPlacements, resolveCatalogForRoles } from '@niscorp/moss';
import type { FunctionHandler } from '@niscorp/nova';
import type { FunctionSession, NiscApp } from '@niscorp/moss';
import type { PgPool } from '@niscorp/vex';
import { contextFor } from '@lyra/app/nav/sections';
import { greetingFrom, phrasesFor } from '../phrases';
import { installedFor, localeOf, personCard, studioOf } from '../lookup';
import { dayIn } from '../clock';

export const navFunctions = (
  session: FunctionSession,
  deps: { app: NiscApp; pool: PgPool },
): Record<string, FunctionHandler> => ({
  'nav.identity': async () => {
    if (session.principal === null) return {};
    const person = await personCard(deps.pool, session.principal);
    if (person === undefined) return {};
    const studio = await deps.pool.query('SELECT name, locale FROM studios WHERE id = $1', [person.studioId]);
    const row = studio.rows[0] as { name?: unknown; locale?: unknown } | undefined;
    return {
      studioName: String(row?.name ?? ''),
      personName: person.name,
      // The same composer `inputs` uses, so the opening paint and this
      // confirming read cannot disagree about which language they greet in.
      greeting: greetingFrom(await phrasesFor(deps.pool, String(row?.locale ?? 'en-GB')), person.name, new Date()),
    };
  },
  'reports.window': async (data) => {
    const studioId = await studioOf(deps.pool, session.principal);
    if (studioId === '') return {};
    const zone = await deps.pool.query('SELECT timezone FROM studios WHERE id = $1', [studioId]);
    const to = dayIn(String((zone.rows[0] as { timezone?: unknown } | undefined)?.timezone ?? 'UTC'));
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
    const granted = resolveCatalogForRoles(deps.app as never, session.roles, await installedFor(deps.pool, session.principal)).ids;
    const context = contextFor(action, granted);
    if (context.areaId === '') return { areaId: action, areaLabel: '', tabs: [], moreValue: '' };

    const placements = await listPlacements(deps.pool);
    const placed = granted
      .filter((id) => placements[id] === context.areaId)
      .map((id) => ({ action: id, label: deps.app.actions[id]?.title ?? id, icon: 'addons' }))
      .sort((a, b) => a.label.localeCompare(b.label));

    const tabs = [...context.tabs, ...placed];
    return {
      areaId: context.areaId,
      areaLabel: context.areaLabel,
      // Same rule as the taxonomy: one tab is a label pretending to be a
      // control. A pack's screen can be what makes an area worth tabs.
      tabs: tabs.length > 1 ? tabs.map((t) => ({ value: t.action, label: t.label })) : [],
      moreValue: (((data['primaryAreas'] ?? []) as { areaId?: string }[]).some((a) => a.areaId === context.areaId) ? '' : context.areaId),
    };
  },

  'nav.attachments': async (data) => {
    const host = String(data['hostId'] ?? '');
    if (host === '') return [];
    const granted = resolveCatalogForRoles(deps.app as never, session.roles, await installedFor(deps.pool, session.principal)).ids;
    const attached = await listAttachments(deps.pool, host);

    const offers = deps.app.attachable?.[host] ?? {};
    const offered: Record<string, unknown> = {};
    for (const [key, path] of Object.entries(offers)) {
      offered[key] = path.split('.').reduce<unknown>((at, segment) => (at !== null && typeof at === 'object' ? (at as Record<string, unknown>)[segment] : undefined), data);
    }

    return Promise.all(
      attached
        .filter(({ actionId }) => granted.includes(actionId))
        .map(async ({ actionId, preview }) => {
          const row: Record<string, unknown> = { action: actionId, label: deps.app.actions[actionId]?.title ?? actionId, bands: [], hint: '' };
          if (preview === '') return row;
          try {
            const res = await session.wire(preview, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(offered) });
            if (res.ok) {
              const atoms = (await res.json()) as { bands?: unknown; hint?: unknown };
              if (Array.isArray(atoms.bands)) row['bands'] = atoms.bands;
              if (typeof atoms.hint === 'string') row['hint'] = atoms.hint;
            }
          } catch {
            /* a pack that is down costs its preview, nothing else */
          }
          return row;
        }),
    );
  },

});
