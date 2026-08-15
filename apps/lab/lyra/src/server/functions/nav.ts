import { listAttachments, listPlacements } from '@niscorp/moss';
import type { FunctionHandler } from '@niscorp/nova';
import type { FunctionSession, NiscApp } from '@niscorp/moss';
import type { PgPool } from '@niscorp/vex';
import { contextFor } from '@lyra/app/nav/sections';
import { bookOverWire } from '@lyra/app/app';
import { greetingFrom } from '../phrases';
import { dayIn } from '../clock';

export const navFunctions = (
  session: FunctionSession,
  deps: { app: NiscApp; pool: PgPool },
): Record<string, FunctionHandler> => {
  // LIVE, not the build-time snapshot. `session.actions` is what the shell was
  // BUILT with; an integration landing mid-session re-registers definitions without a
  // rebuild, and these two functions are exactly where the newly-granted ids
  // must appear. `/catalog` answers current, per principal, memo-backed.
  const grantedNow = async (): Promise<readonly string[]> => {
    const response = await session.wire('/catalog', {});
    if (!response.ok) return session.actions;
    const body = (await response.json()) as { actions?: unknown };
    return Array.isArray(body.actions) ? body.actions.map(String) : session.actions;
  };

  return {
  // ── WHO THIS SESSION MAY ACT FOR ──────────────────────────
  //
  // Off the identity record, never a lookup — the same rule every other seam
  // in this file follows. The children were read ONCE, by the `identity` role
  // (which holds `people.read` pinned to the household), when the session
  // resolved.
  //
  // It is a function rather than an entry because a member holds no
  // `people.read` and never will: "a member cannot read the roll" is an
  // invariant three checks assert, and a name lives on `people`. This is the
  // seam that lets a parent see their child's NAME without the rung gaining a
  // verb that would make the roster replayable.
  //
  // A picker is all this feeds. Nothing here decides what anybody may DO —
  // the household reach and the guardianships `$lookup` do that, engine-side,
  // and they would refuse a subject this list was wrong about.
  'nav.family': async () => (session.principal === null ? [] : Array.isArray(session.identity['household']) ? session.identity['household'] : []),

  'nav.identity': async () => {
    // EVERYTHING A SESSION IS is on the session: the record the engine
    // resolved carries the name, the studio and the language. Nothing here
    // looks anybody up — the lookups were the disease.
    if (session.principal === null) return {};
    const name = String(session.identity['name'] ?? '');
    return {
      studioName: String(session.identity['studioName'] ?? ''),
      personName: name,
      // The same composer `inputs` uses, so the opening paint and this
      // confirming read cannot disagree about which language they greet in.
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
      // control. An integration's screen can be what makes an area worth tabs.
      tabs: tabs.length > 1 ? tabs.map((t) => ({ value: t.action, label: t.label })) : [],
      moreValue: (((data['primaryAreas'] ?? []) as { areaId?: string }[]).some((a) => a.areaId === context.areaId) ? '' : context.areaId),
    };
  },

  'nav.attachments': async (data) => {
    const host = String(data['hostId'] ?? '');
    if (host === '') return [];
    // The session's own catalog — installs already filtered by the record.
    const granted = await grantedNow();
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
            /* an integration that is down costs its preview, nothing else */
          }
          return row;
        }),
    );
  },

};
};
