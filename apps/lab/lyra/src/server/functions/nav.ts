import { listAttachments, listPlacements, resolveCatalog } from '@niscorp/moss';
import type { FunctionHandler } from '@niscorp/nova';
import type { FunctionSession, MossServer, NiscApp } from '@niscorp/moss';
import type { PgPool } from '@niscorp/vex';
import { contextFor } from '@lyra/app/nav/sections';
import { loadDirectory } from '../users';
import type { Directory } from '@lyra/app/app';

// WHAT A HUB IS ALLOWED TO OFFER.
//
// A hub lists its area's screens, and it must list only the ones this principal
// actually holds — a link that mounts nothing is the bug that made an
// instructor's nav offer a "Members" button leading to a blank page.
//
// This is a `fn:` rather than `inputs` for a reason worth keeping: `inputs`
// seeds the action mounted at BOOT, so a hub reached by tapping would arrive
// with an empty list. That is the same dead binding that once left the eyebrow
// blank on every navigated-to screen, and it fails the same silent way.
//
// The area names itself from the action's own data, so there is no argument a
// request can aim somewhere else — and the answer is filtered against the
// principal's resolved catalog, which is ring 1 doing the work rather than this
// function deciding anything.
export const navFunctions = (
  session: FunctionSession,
  deps: { app: NiscApp; directory: Directory; pool: PgPool; server: () => MossServer },
): Record<string, FunctionHandler> => ({
  // WHO YOU ARE, ON EVERY MOUNT — not only the first one.
  //
  // The landing screen's "Good evening, Maren" and its studio eyebrow came from
  // boot `inputs`, which is the dead binding the comment below already
  // describes. It went unnoticed because the landing screen WAS the boot mount:
  // you only saw the blank version by navigating away and coming back, and
  // until the menu grouped things there was barely a way back.
  //
  // The shell is durable, so the empty remount survived a reload too — a
  // permanently headless landing screen, from one tap.
  //
  // Same rule as `nav.hub`: identity is read from the session on the server,
  // which also means nothing about it is client-authored.
  'nav.identity': async () => {
    const person = deps.directory.person(session.principal);
    if (person === undefined) return {};
    const hour = new Date().getHours();
    const first = person.name.split(' ')[0] ?? person.name;
    return {
      studioName: person.studioName,
      personName: person.name,
      greeting: `Good ${hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}, ${first}`,
    };
  },
  // THE REPORT WINDOW, RESOLVED ON THE STUDIO'S CLOCK.
  //
  // A range the browser computed would be the studio-clock bug wearing a new
  // hat: a studio in Kiritimati and one in Niue are on different dates at the
  // same instant, so "the last 90 days" ends somewhere different for each. The
  // studio owns its day; this is that day, and a span back from it.
  //
  // The presets are named here rather than in a layout because a layout that
  // computed dates would be a layout doing arithmetic — and because a studio
  // that opens the screen has to see a period without choosing one first.
  'reports.window': async (data) => {
    const person = deps.directory.person(session.principal);
    if (person === undefined) return {};
    const to = deps.directory.todayFor(person.studioId);
    const days = Number(data['days'] ?? 90);
    const from = new Date(`${to}T00:00:00Z`);
    from.setUTCDate(from.getUTCDate() - days);
    return {
      from: from.toISOString().slice(0, 10),
      to,
      label: days === 30 ? 'Last 30 days' : days === 365 ? 'Last 12 months' : `Last ${days} days`,
    };
  },
  // THE STORE'S TWO READS, STITCHED.
  //
  // They cannot be one query: `integrations` is the deployment's catalogue with
  // no studio_id, and `studio_integrations` is this studio's, scoped like every
  // other table here. Putting an unscoped table and a scoped one in the same
  // FROM makes the answer depend on which rule wins — so they stay two reads and
  // meet here, where the joining is plain code over two answers the engine has
  // already scoped.
  //
  // The row's `installed` flag is what the layout's showKey/hideKey read, which
  // is why one row can carry both buttons and render exactly one.
  'addons.stitch': async (data) => {
    const offered = (data['offered'] ?? []) as { integration_id: string; title: string; tagline: string; description: string; adds: string; settings_action: string }[];
    const installed = new Set(((data['installed'] ?? []) as { integration_id: string }[]).map((r) => r.integration_id));
    return offered.map((row) => {
      const on = installed.has(row.integration_id);
      return {
        integration_id: row.integration_id,
        name: row.title !== '' ? row.title : row.integration_id,
        tagline: row.tagline,
        description: row.description,
        adds: row.adds,
        settings_action: row.settings_action,
        installed: on,
        // The tile's Settings affordance exists only when BOTH are true: the
        // pack shipped a settings screen, and this studio has it on. A store
        // must never open functionality a studio has not bought.
        has_settings: on && row.settings_action !== '',
        state_label: on ? 'On' : 'Available',
        state_tone: on ? 'good' : 'neutral',
        // WHAT APPEARS WHERE, as a fact rather than a clipped sentence in a
        // table cell. The tile has room for it because a tile is the shape an
        // object with a paragraph wants.
        facts: row.adds === '' ? [] : [{ label: 'Adds', value: row.adds }],
      };
    });
  },
  // WHERE AM I, AND WHAT IS BESIDE ME.
  //
  // Called by the chrome on every navigation. It answers with the area a screen
  // belongs to and the screens beside it — which is what the tab row above the
  // content renders, and what tells the rail which entry to light.
  //
  // Derived per call rather than seeded, and that is not an optimisation: a
  // message carries no payload in this grammar, so a screen cannot tell the
  // chrome what it is; and `inputs` seeds only the boot mount, so it answers
  // once and then lies. This answers every time, from the taxonomy the menu is
  // already built from.
  //
  // PLACED SCREENS JOIN THEIR AREA, beside lyra's own. The bundle declared the
  // hub, intake validated it, and the catalog already encodes granted ∩
  // installed — so an uninstall empties this without anybody remembering to.
  'nav.context': async (data) => {
    const action = String(data['currentLeaf'] ?? '');
    const granted = resolveCatalog(deps.app as never, session.principal).ids;
    const context = contextFor(action, granted);
    // A SCREEN IN NO AREA IS ITS OWN. That is Home — it belongs to no group and
    // its action differs per rung, so it is in no table. Returning an empty
    // areaId here would unlight the whole nav on the one screen everybody
    // starts on; returning the action itself lights exactly the entry whose
    // identity IS that action, which is how Home is seeded.
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
      // ...and MORE lights when you are behind it. Three of seven areas live
      // there for an owner, and while you were in one of them the whole thumb
      // bar was dark — the exact "where am I" failure this arrangement exists
      // to fix, just moved down the screen.
      //
      // `primaryAreas` comes in from the action's own data, which the manifest
      // already seeded, so nothing here re-derives which four the bar shows.
      // Empty when you ARE in a primary area, and `Tab` treats an empty value
      // as "never current" — so More is a door until it is a place.
      moreValue: (((data['primaryAreas'] ?? []) as { areaId?: string }[]).some((a) => a.areaId === context.areaId) ? '' : context.areaId),
    };
  },

  // WHICH PANELS RIDE THE OPEN SCREEN. A host action that declared itself
  // attachable asks with its own id (self-named in its data, like a hub);
  // the answer is granted ∩ installed ∩ attached-here, so the strip renders
  // for the studio that bought the pack and for nobody else — and renders
  // NOTHING when the answer is empty, which is the whole cost of the seat.
  //
  // A rider that declared a PREVIEW gets called with the offered ids — over
  // the session's own wire, so the proxy mints the same assertion any panel
  // call gets — and its display atoms (`bands`, `hint`) land on the strip
  // row: the belt itself, not the word for it. A preview that fails leaves a
  // plain labelled row; the strip never breaks for a slow pack.
  'nav.attachments': async (data) => {
    const host = String(data['hostId'] ?? '');
    if (host === '') return [];
    const granted = resolveCatalog(deps.app as never, session.principal).ids;
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

  // THE INSTALL, APPLIED. A fn rather than a bare vex endpoint, for two reasons
  // that are both about what a single statement cannot do:
  //
  //   THE TOGGLE BRANCHES. Install is an INSERT, and the row uninstall leaves
  //   behind (enabled=false, deliberately — history) keeps the primary key, so
  //   installing a second time must be an UPDATE. The grammar cannot branch on
  //   what exists; this can, and every write it makes is still a seeded
  //   fingerprint replayed over the SESSION'S OWN WIRE — the owner's token, the
  //   owner's compiled policy, studio stamped by the engine. No privileged path.
  //
  //   THE ROW IS NOT THE CHANGE. What an install means is a different catalog:
  //   the directory snapshot reloads and the memos drop, or the menu keeps not
  //   showing what the studio just bought. The action's comment claimed a fn
  //   did this; now one does.
  'addons.apply': async (data) => {
    const integrationId = String(data['pendingId'] ?? '');
    const enable = data['pendingEnable'] === true;
    if (integrationId === '') throw new Error('addons.apply: no integration named');

    const vex = async (fingerprint: string, context: Record<string, unknown>): Promise<unknown> => {
      const res = await session.wire('/api/studio/vex', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fingerprint, context }),
      });
      if (!res.ok) throw new Error(`${fingerprint}: refused (${res.status})`);
      return res.json();
    };

    if (enable) {
      // Re-enable first — a no-op when no row exists — then insert only if the
      // integration is still absent. Idempotent from every starting state.
      await vex('addons/reenable', { integrationId });
      const rows = (await vex('addons/installed', {})) as { integration_id: string }[];
      if (!rows.some((r) => r.integration_id === integrationId)) {
        await vex('addons/install', { integrationId });
      }
    } else {
      await vex('addons/uninstall', { integrationId });
    }

    await loadDirectory(deps.pool);
    deps.server().refresh();
    return { applied: integrationId, enabled: enable };
  },
});
