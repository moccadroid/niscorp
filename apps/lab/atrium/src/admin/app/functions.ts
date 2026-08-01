import { z } from 'zod';
import type { ActionDefinition, FunctionHandler, LayoutNode } from '@niscorp/nova';
import type { FunctionSession } from '@niscorp/moss';
import { componentsOf } from '@niscorp/nova/reflect';
import type { Seam } from '@atrium/admin/seam';
import { sampleData } from './sample';

// Every read and write this tool makes, and all of them go through the seam.
//
// There is no vex here and no database: an `fn:` handler is not an escape hatch
// in this app, it is the ONLY door, because the thing being administered lives
// in another process. What each handler does is fetch one seam route and shape
// it for the pane that asked — the seam serves facts, the tool decides how they
// read, and neither knows the other's business.
//
// Shaping is not decoration. The seam hands over unjoined lists (slots,
// properties, resolutions) because that is what they are in the database; a
// pane needs one row per line with its state already decided. Doing that join
// here rather than in a layout is the same rule the app itself follows: no
// component works anything out.

type Row = Record<string, unknown>;
const str = (row: Row | undefined, key: string): string => String(row?.[key] ?? '');
// Token counts get big fast; unseparated they are unreadable at a glance.
const thousands = (value: number): string => value.toLocaleString('en-GB');
const rows = (value: unknown, key: string): Row[] => {
  const held = (value as Record<string, unknown> | null)?.[key];
  return Array.isArray(held) ? (held as Row[]) : [];
};
const list = (value: unknown, key: string): string[] => {
  const held = (value as Record<string, unknown> | null)?.[key];
  return Array.isArray(held) ? (held as unknown[]).map(String) : [];
};
// Chips are rendered by a `for` loop, so a bare string array will not do —
// every one needs a key to render under.
const labels = (values: readonly string[]): { label: string }[] => values.map((label) => ({ label }));

// Rule 13 at this boundary too: a payload that crossed a wire is parsed, never
// cast. Zod drops what it does not name, so each handler sees exactly the keys
// it uses out of the whole action-data blob.
const Probe = z.object({ probe: z.object({ id: z.string().optional() }).optional() });
const Property = z.object({ property: z.object({ id: z.string().optional() }).optional() });
const SlotStage = z.object({ stage: z.object({ id: z.string().optional(), enabled: z.boolean().optional() }).optional() });
const Selected = z.object({ selected: z.object({ id: z.string().optional() }).optional() });
const Filter = z.object({ filter: z.string().optional() });
const Principal = z.object({ principal: z.object({ id: z.string().optional() }).optional() });
const Explain = z.object({ principal: z.object({ id: z.string().optional() }).optional(), state: z.string().optional() });
const CapabilityStage = z.object({
  selected: z.object({ id: z.string().optional() }).optional(),
  stage: z.object({ capability_id: z.string().optional(), enabled: z.boolean().optional(), property_id: z.string().optional() }).optional(),
});

export const adminFunctions = (session: FunctionSession, seam: Seam): Record<string, FunctionHandler> => ({
  // ── the charter, compiled ─────────────────────────────────
  // Roles beside the principals who wear them, and each principal's resolved
  // catalog riding along on the row so opening one costs no second call.
  'admin.charter': async () => {
    const [actors, charter] = await Promise.all([seam.get('/operator/actors'), seam.get('/operator/charter')]);
    const shape = (id: string, name: string, who: string, roles: string[], ids: string[], titles: Map<string, string>, detail: string): Row => ({
      id,
      name,
      who,
      roles: roles.join(', '),
      count: `${ids.length}`,
      countTone: ids.length === 0 ? 'neutral' : 'accent',
      detail,
      actions: ids.map((actionId) => ({
        id: actionId,
        title: titles.get(actionId) ?? '',
        source: actionId.startsWith('ext.') ? 'integration' : 'core',
        tone: actionId.startsWith('ext.') ? 'accent' : 'neutral',
      })),
    });

    // Titles come from the catalog route so the action list reads as surfaces
    // rather than identifiers.
    const catalog = await seam.get('/operator/actions');
    const titles = new Map(rows(catalog, 'actions').map((a) => [str(a, 'id'), str(a, 'title')]));

    const principals = rows(actors, 'principals').map((person) => {
      const ids = list(person, 'actions');
      return shape(
        str(person, 'id'),
        str(person, 'name'),
        `${str(person, 'audience')}${str(person, 'property') === '' ? '' : ` · ${str(person, 'property')}`}`,
        list(person, 'roles'),
        ids,
        titles,
        `${String(person['core'] ?? 0)} core · ${String(person['ext'] ?? 0)} from integrations`,
      );
    });

    // Anonymous is a principal, not an absence — and what it resolves to (the
    // login page, nothing else) is a fact worth seeing beside the others rather
    // than one you have to infer.
    const anonymous = (actors as Record<string, unknown>)['anonymous'];
    const anonIds = list(anonymous, 'actions');
    principals.push(shape('(anonymous)', 'Anonymous', 'nobody signed in', ['public'], anonIds, titles, 'what a stranger holds'));

    return {
      principals,
      roles: rows(charter, 'roles').map((role) => ({
        role: str(role, 'role'),
        detail: `${list(role, 'actions').length} actions · ${list(role, 'data').length} data verbs`,
        issues: list(role, 'issues').join('; '),
      })),
      warnings: rows(charter, 'warnings').map((warning) => ({ rule: str(warning, 'rule'), detail: str(warning, 'detail') })),
    };
  },

  // The inverse index, which nothing else in the stack can answer: given an
  // action, who may ever hold it. Composed here from the same matrix — charter
  // has no reverse lookup, and building one into it would only ever serve this.
  'admin.holders': async (data) => {
    const wanted = Probe.parse(data).probe?.id ?? '';
    if (wanted === '') return [];
    const actors = await seam.get('/operator/actors');
    return rows(actors, 'principals')
      .filter((person) => list(person, 'actions').includes(wanted))
      .map((person) => ({ id: str(person, 'id'), name: str(person, 'name'), who: str(person, 'audience') }));
  },

  // ── the catalog ───────────────────────────────────────────
  'admin.catalog': async (data) => {
    const filter = (Filter.parse(data).filter ?? '').trim().toLowerCase();
    const report = await seam.get('/operator/actions');
    return rows(report, 'actions')
      .filter((action) => filter === '' || str(action, 'id').toLowerCase().includes(filter) || str(action, 'title').toLowerCase().includes(filter))
      .map((action) => ({
        id: str(action, 'id'),
        title: str(action, 'title'),
        source: str(action, 'source'),
        tone: str(action, 'source') === 'core' ? 'neutral' : 'accent',
      }));
  },

  // One definition, opened up. Everything here is mechanically derived from the
  // JSON — no prose about what an action "is for", because the definition is
  // the only honest account of that and it is right here.
  'admin.definition': async (data) => {
    const id = Selected.parse(data).selected?.id ?? '';
    if (id === '') return {};
    const fetched = await seam.get(`/operator/action/${encodeURIComponent(id)}`);
    const definition = ((fetched as Record<string, unknown>)['definition'] ?? {}) as ActionDefinition;
    const declared = (definition.data ?? {}) as Record<string, unknown>;
    const input = ((definition.input as { properties?: Record<string, unknown> } | undefined)?.properties ?? {}) as Record<string, unknown>;

    const endpoints = Object.entries((definition.endpoints ?? {}) as Record<string, Record<string, unknown>>).map(([name, endpoint]) => ({
      name,
      target: endpoint['target'] === undefined ? 'no target' : `→ ${String(endpoint['target'])}`,
      // A `fn:` runs in the server's own process; a url crosses the wire. Which
      // one an action uses is the most load-bearing fact about it.
      reaches: endpoint['fn'] !== undefined ? `fn: ${String(endpoint['fn'])}` : String(endpoint['url'] ?? '—'),
    }));

    const triggers = ((definition.triggers ?? []) as Record<string, unknown>[]).map((trigger) => ({
      on: trigger['message'] !== undefined ? `channel: ${String(trigger['message'])}` : `${String(trigger['event'] ?? '?')} ${String(trigger['ref'] ?? '')}`.trim(),
      does: ((trigger['do'] ?? []) as Record<string, unknown>[]).map((step) => Object.keys(step)[0] ?? '?').join(' · '),
    }));

    // The component vocabulary its layout draws from, counted. nova's own walk,
    // so it cannot drift from what actually renders.
    const used = [...componentsOf(definition.layout ?? {})].sort();

    return {
      summary: `${endpoints.length} endpoints · ${triggers.length} triggers · ${Object.keys(declared).length} data keys`,
      input: labels(Object.keys(input).sort()),
      data: labels(Object.keys(declared).sort()),
      components: labels(used),
      endpoints,
      triggers,
    };
  },

  // THE PREVIEW. The layout arrives as data, so it can be rendered.
  //
  // Three steps, and each one is load-bearing:
  //
  //   1. teach this shell the component names that layout uses. moss builds a
  //      server-side registry of name-only stubs from the app's OWN layouts, so
  //      a foreign layout would fail validation naming components this shell
  //      has never heard of. The browser side already has them — both terminals
  //      were handed the same kit.
  //   2. fill it. An action's declared data is its empty state, so rendering it
  //      faithfully draws three skeleton bars; `sampleData` derives a shape from
  //      the layout's own bindings instead (see sample.ts).
  //   3. register and hand back. Endpoints, lifecycle and triggers are simply
  //      not carried over, so nothing in a preview can call anything — that is
  //      a property of what is registered rather than a rule being enforced.
  'admin.preview': async (data) => {
    const id = Selected.parse(data).selected?.id ?? '';
    if (id === '') throw new Error('No action named.');
    const fetched = await seam.get(`/operator/action/${encodeURIComponent(id)}`);
    const definition = ((fetched as Record<string, unknown>)['definition'] ?? {}) as ActionDefinition;
    if (definition.layout === undefined) throw new Error(`${id} declares no layout of its own.`);

    for (const name of componentsOf(definition.layout)) {
      session.shell.registry.register(name, {} as Parameters<typeof session.shell.registry.register>[1]);
    }

    session.shell.registerAction({
      id: 'admin.preview',
      title: definition.title ?? id,
      data: { ...sampleData(definition), previewTitle: '', previewId: '' },
      layout: definition.layout as LayoutNode,
    });
    return { id, title: definition.title ?? id };
  },

  // ── the resolved surface ──────────────────────────────────
  // Every surface we ship, at one property, with the resolver's verdict already
  // attached. The four factors as a list: what the connector offers, what the
  // property enabled, whether it runs the connector that shipped the slot, and
  // — the column that is ours — whether we have withdrawn it.
  'admin.surface': async (data) => {
    const asked = Property.parse(data).property?.id ?? '';
    const report = await seam.get('/operator/surface');
    const properties = rows(report, 'properties');
    const property = properties.find((p) => str(p, 'id') === asked) ?? properties[0];
    const propertyId = str(property, 'id');
    const verdicts = new Map(rows(report, 'resolved').filter((r) => str(r, 'property_id') === propertyId).map((r) => [str(r, 'slot_id'), r]));

    return {
      properties: properties.map((p) => ({ id: str(p, 'id'), name: str(p, 'name'), city: str(p, 'city'), connector: str(p, 'connector'), active: str(p, 'id') === propertyId })),
      property: { id: propertyId, name: str(property, 'name') },
      slots: rows(report, 'slots').map((slot) => {
        const verdict = verdicts.get(str(slot, 'id'));
        const reason = str(verdict, 'reason');
        return {
          id: str(slot, 'id'),
          title: str(slot, 'title'),
          detail: `${str(slot, 'audience')} · ${str(slot, 'action_id')}${str(slot, 'capability_id') === '' ? '' : ` · needs ${str(slot, 'capability_id')}`}`,
          source: str(slot, 'source'),
          enabled: slot['enabled'] === true,
          live: verdict?.['live'] === true,
          state: STATE_TEXT[reason] ?? reason,
          tone: STATE_TONE[reason] ?? 'neutral',
        };
      }),
    };
  },

  // OUR switch, estate-wide. The seam writes the row and runs the resolver;
  // living shells adopt before this call returns.
  'admin.setSlot': async (data) => {
    const stage = SlotStage.parse(data).stage ?? {};
    if (stage.id === undefined) throw new Error('No slot named.');
    return seam.post('/operator/slot', { slotId: stage.id, enabled: stage.enabled !== true });
  },

  // ── capabilities ──────────────────────────────────────────
  'admin.capabilities': async (data) => {
    const asked = Selected.parse(data).selected?.id ?? '';
    const report = await seam.get('/operator/config');
    const connectors = rows(report, 'connectors');
    const connector = connectors.find((c) => str(c, 'id') === asked) ?? connectors[0];
    const connectorId = str(connector, 'id');
    return {
      connectors: connectors.map((c) => ({
        id: str(c, 'id'),
        name: str(c, 'name'),
        detail: `${str(c, 'vendor')} · ${str(c, 'kind')} · build v${str(c, 'live_version')}`,
        active: str(c, 'id') === connectorId,
      })),
      connector: { id: connectorId, name: str(connector, 'name'), service: str(connector, 'service_url') },
      offers: rows(report, 'offers')
        .filter((offer) => str(offer, 'connector_id') === connectorId)
        .map((offer) => ({
          capability_id: str(offer, 'capability_id'),
          label: str(offer, 'label'),
          detail: `${str(offer, 'capability_id')} · arrived in v${str(offer, 'version')}`,
          enabled: offer['enabled'] === true,
        })),
      properties: rows(report, 'properties').map((row) => ({
        property_id: str(row, 'property_id'),
        capability_id: str(row, 'capability_id'),
        label: `${str(row, 'property_name')} — ${str(row, 'label')}`,
        enabled: row['enabled'] === true,
      })),
    };
  },

  // One handler for both switches, because they are one decision at two
  // altitudes: a connector row withdraws a capability from every property on
  // that integration, a property row from one. The seam resolves whichever
  // moved.
  'admin.setCapability': async (data) => {
    const parsed = CapabilityStage.parse(data);
    const stage = parsed.stage ?? {};
    if (stage.capability_id === undefined) throw new Error('No capability named.');
    const flipped = stage.enabled !== true;
    if (stage.property_id !== undefined && stage.property_id !== '') {
      return seam.post('/operator/capability', { propertyId: stage.property_id, capabilityId: stage.capability_id, enabled: flipped });
    }
    return seam.post('/operator/capability', { connectorId: parsed.selected?.id ?? '', capabilityId: stage.capability_id, enabled: flipped });
  },

  // Discovery on demand — the same pull boot runs. The reports come back per
  // connector, refusals included, because a bundle a vendor broke is exactly
  // the thing this tool exists to make visible.
  'admin.sync': async (data) => {
    const connectorId = Selected.parse(data).selected?.id ?? '';
    const report = await seam.post('/operator/sync', { connectorId });
    return rows(report, 'reports').map((line) => ({
      connector: str(line, 'connector'),
      ok: line['ok'] === true,
      tone: line['ok'] === true ? 'good' : 'warn',
      detail: line['ok'] === true ? 'landed' : list(line, 'reasons').join('; '),
    }));
  },

  // ── why can this principal not see that? ──────────────────
  // Nothing here computes a new truth. The resolver already decided the middle
  // of the chain and recorded WHY in `property_slots.reason`; the charter
  // already decided the ceiling. This puts the links in order and names the one
  // that broke — which is the whole difference between four tables and an
  // answer.
  'admin.explain': async (data) => {
    const parsed = Explain.parse(data);
    const asked = parsed.principal?.id ?? '';
    const state = parsed.state ?? 'any';

    const [actors, surface] = await Promise.all([seam.get('/operator/actors'), seam.get('/operator/surface')]);
    const people = rows(actors, 'principals');
    const subject = people.find((p) => str(p, 'id') === asked) ?? people[0];
    const audience = str(subject, 'audience');
    const propertyId = str(subject, 'propertyId');
    const granted = new Set(list(subject, 'actions'));
    const verdicts = new Map(rows(surface, 'resolved').filter((r) => str(r, 'property_id') === propertyId).map((r) => [str(r, 'slot_id'), r]));

    // Only this principal's audience: a desk slot is not "blocked" for a guest,
    // it is somebody else's surface, and listing it as a failure would bury the
    // eighteen answers that matter under forty that never applied.
    const mine = rows(surface, 'slots').filter((slot) => str(slot, 'audience') === audience);

    const slots = mine.map((slot) => {
      const verdict = verdicts.get(str(slot, 'id'));
      const reason = str(verdict, 'reason');
      const wants = str(slot, 'stay_state');
      const chain = [
        { factor: 'audience', ok: true, label: 'audience', because: '' },
        {
          factor: 'charter',
          ok: granted.has(str(slot, 'action_id')),
          label: 'charter',
          because: `The charter does not grant ${str(slot, 'action_id')} to any role this principal wears.`,
        },
        {
          factor: 'resolver',
          ok: verdict?.['live'] === true,
          label: 'resolved',
          because: REASON_TEXT[reason] ?? `The resolver said "${reason}".`,
        },
        {
          factor: 'stay',
          // A slot that does not care about stay state says 'any'.
          ok: wants === 'any' || wants === state,
          label: `stay: ${wants}`,
          because: `This surface applies to a stay that is "${wants}"; the state asked about is "${state}".`,
        },
      ];

      // The first broken link is the answer. Everything after it was never
      // asked, so it is shown as unreached rather than as passing.
      const brokeAt = chain.findIndex((link) => !link.ok);
      const placed = brokeAt === -1;
      return {
        id: str(slot, 'id'),
        title: str(slot, 'title'),
        detail: `${str(slot, 'action_id')}${str(slot, 'capability_id') === '' ? '' : ` · needs ${str(slot, 'capability_id')}`}`,
        verdict: placed ? 'placed' : `stopped at ${chain[brokeAt]?.factor ?? '?'}`,
        tone: placed ? 'good' : 'alert',
        bg: placed ? 'surface' : 'sunk',
        because: placed ? '' : (chain[brokeAt]?.because ?? ''),
        chain: chain.map((link, index) => ({
          factor: link.factor,
          label: link.label,
          tone: placed || index < brokeAt ? 'good' : index === brokeAt ? 'alert' : 'neutral',
        })),
      };
    });

    return {
      principals: people
        .filter((person) => str(person, 'id') !== '(anonymous)')
        .map((person) => ({
          id: str(person, 'id'),
          name: str(person, 'name'),
          who: `${str(person, 'audience')} · ${str(person, 'property')}`,
          icon: 'flag',
          active: str(person, 'id') === str(subject, 'id'),
        })),
      states: STAY_STATES.map((value) => ({ value, label: value, active: value === state })),
      subject: {
        name: str(subject, 'name'),
        detail: `${audience} at ${str(subject, 'property')}, for a stay that is "${state}"`,
      },
      slots,
      placed: slots.filter((slot) => slot.tone === 'good').length,
      total: slots.length,
    };
  },

  // ── the data API ──────────────────────────────────────────
  'admin.entries': async (data) => {
    const filter = (Filter.parse(data).filter ?? '').trim().toLowerCase();
    const report = await seam.get('/operator/entries');
    return {
      entries: rows(report, 'entries')
        .filter((entry) => filter === '' || str(entry, 'fingerprint').toLowerCase().includes(filter) || str(entry, 'intent').toLowerCase().includes(filter))
        .map((entry) => {
          const callers = rows(entry, 'callers');
          return {
            fingerprint: str(entry, 'fingerprint'),
            intent: str(entry, 'intent'),
            kind: str(entry, 'kind'),
            source: str(entry, 'source'),
            // The badge carries the finding, not the kind — an orphan is the
            // thing you want to spot while scanning.
            badge: callers.length === 0 ? 'nothing calls it' : str(entry, 'kind'),
            tone: callers.length === 0 ? 'warn' : str(entry, 'kind') === 'write' ? 'accent' : 'neutral',
            context: labels(list(entry, 'context')),
            tables: labels(list(entry, 'tables')),
            shape: labels(list(entry, 'shape')),
            callers: callers.map((caller) => ({
              label: `${str(caller, 'action')}:${str(caller, 'endpoint')}`,
              action: str(caller, 'action'),
              endpoint: str(caller, 'endpoint'),
              url: str(caller, 'url'),
            })),
            json: JSON.stringify(entry['definition'], null, 2),
          };
        }),
      missing: rows(report, 'missing').map((entry) => ({
        fingerprint: str(entry, 'fingerprint'),
        by: rows(entry, 'callers').map((caller) => `${str(caller, 'action')}:${str(caller, 'endpoint')}`).join(', '),
      })),
    };
  },

  // ── the feed ──────────────────────────────────────────────
  'admin.timeline': async (data) => {
    const asked = Principal.parse(data).principal?.id ?? '';
    const [report, roster] = await Promise.all([seam.get('/operator/timeline'), seam.get('/operator/roster')]);
    const all = rows(report, 'calls');
    const names = new Map(rows(roster, 'sessions').map((live) => [str(live, 'principal'), str(live, 'name')]));
    const shown = asked === '' || asked === 'all' ? all : all.filter((call) => str(call, 'principal') === asked);
    const now = Date.now();

    return {
      subject: asked === '' || asked === 'all' ? 'Everything the shells called' : `${names.get(asked) ?? asked} — their calls`,
      principals: [
        { id: 'all', name: 'Everyone', detail: `${all.length} calls`, active: asked === '' || asked === 'all' },
        ...[...new Set(all.map((call) => str(call, 'principal')))].map((id) => ({
          id,
          name: names.get(id) ?? id,
          detail: `${all.filter((call) => str(call, 'principal') === id).length} calls`,
          active: id === asked,
        })),
      ],
      figures: {
        count: `${shown.length}`,
        slowest: shown.length === 0 ? '—' : `${Math.max(...shown.map((call) => Number(call['ms'] ?? 0)))}ms`,
      },
      calls: shown.map((call, index) => ({
        // The buffer has no ids of its own — a call is an event, not a row —
        // so the position is the key.
        id: `${index}`,
        name: str(call, 'name'),
        from: `${str(call, 'action')} · ${str(call, 'kind')}`,
        who: names.get(str(call, 'principal')) ?? str(call, 'principal'),
        ago: since(now - Number(call['at'] ?? now)),
        outcome: call['ok'] === true ? `${str(call, 'ms')}ms` : `failed ${str(call, 'status')}`,
        tone: call['ok'] === true ? (Number(call['ms'] ?? 0) > 250 ? 'warn' : 'good') : 'alert',
      })),
    };
  },

  // ── every model run ───────────────────────────────────────
  // The row arrives carrying its whole exchange, so opening one costs no second
  // call. What is done here is READING that exchange: the static prefix, the
  // conversation, the tool calls and their results, each already labelled, so the
  // pane renders a list rather than working anything out.
  'admin.runs': async () => {
    const report = await seam.get('/operator/runs');
    const figures = ((report as Record<string, unknown>)['totals'] as Row | undefined) ?? {};
    const count = (row: Row | undefined, key: string): number => Number(row?.[key] ?? 0);

    return {
      figures: {
        runs: String(count(figures, 'runs')),
        total: thousands(count(figures, 'total_tokens')),
        split: `${thousands(count(figures, 'input_tokens'))} / ${thousands(count(figures, 'output_tokens'))}`,
        pace: `${count(figures, 'avg_ms')}ms`,
      },
      byAgent: rows(report, 'byAgent').map((row) => ({
        id: str(row, 'agent_id'),
        agent: str(row, 'agent_id'),
        detail: `${count(row, 'runs')} runs · ${str(row, 'avg_steps')} steps avg · ${count(row, 'avg_ms')}ms avg`,
        total: thousands(count(row, 'total_tokens')),
      })),
      byPerson: rows(report, 'byPerson').map((row) => ({
        id: str(row, 'user_id'),
        who: str(row, 'who'),
        detail: `${count(row, 'runs')} runs · ${count(row, 'unasked')} watch${count(row, 'failed') === 0 ? '' : ` · ${count(row, 'failed')} failed`}`,
        total: thousands(count(row, 'total_tokens')),
      })),
      byModel: rows(report, 'byModel').map((row) => ({
        id: `${str(row, 'provider')}:${str(row, 'model')}`,
        model: str(row, 'model'),
        detail: `${str(row, 'provider')} · ${count(row, 'runs')} runs · ${count(row, 'avg_ms')}ms avg`,
        total: thousands(count(row, 'total_tokens')),
      })),
      runs: rows(report, 'runs').map((row) => {
        const turns = readTurns(str(row, 'turns'));
        const called = turns.flatMap((turn) => turn.calls ?? []);
        return {
          id: str(row, 'id'),
          who: str(row, 'who'),
          when: String(row['created_at'] ?? '').slice(0, 16).replace('T', ' '),
          agent: str(row, 'agent_id'),
          label: str(row, 'label'),
          label_tone: str(row, 'label') === 'watch' ? 'warn' : 'neutral',
          model: str(row, 'model'),
          // `~` marks a run signal counted itself because the provider's streamed
          // usage frame never arrived. An estimate, and it says so.
          tokens: `${row['reported'] === false ? '~' : ''}${thousands(count(row, 'total_tokens'))}`,
          outcome: str(row, 'outcome') === 'ok' ? `${count(row, 'steps')} steps` : 'failed',
          outcome_tone: str(row, 'outcome') === 'ok' ? 'good' : 'alert',
          took: `${count(row, 'elapsed_ms')}ms`,
          // A run that called nothing says so, rather than rendering an empty
          // list under a heading.
          called: called.length === 0 ? 'called nothing' : called.map((call) => call.name).join(' · '),
          prompt: promptText(turns),
          calls: toolCalls(turns),
          response: str(row, 'response'),
        };
      }),
    };
  },

  // ── living shells ─────────────────────────────────────────
  'admin.shells': async () => {
    const [roster, health] = await Promise.all([seam.get('/operator/roster'), seam.get('/operator/health')]);
    const figures = health as Record<string, unknown>;
    const actions = (figures['actions'] as Record<string, unknown> | undefined) ?? {};
    const entries = (figures['entries'] as Record<string, unknown> | undefined) ?? {};
    const sync = (figures['sync'] as Record<string, unknown> | undefined) ?? {};
    const reports = Array.isArray(sync['reports']) ? (sync['reports'] as Row[]) : [];
    return {
      sessions: rows(roster, 'sessions').map((live) => ({
        id: str(live, 'principal'),
        name: str(live, 'name'),
        who: `${str(live, 'audience')}${str(live, 'property') === '' ? '' : ` · ${str(live, 'property')}`}`,
        mounted: `${str(live, 'mounted')} mounted`,
        tone: 'accent',
        // A canvas is a STACK, so the trail is the stack: what is under what.
        stacks: rows(live, 'canvases').map((canvas) => ({ id: str(canvas, 'id'), trail: list(canvas, 'actions').join(' › ') })),
      })),
      health: {
        uptime: `${Math.round(Number(figures['uptimeMs'] ?? 0) / 1000)}s`,
        actions: `${String(actions['core'] ?? 0)} core · ${String(actions['ext'] ?? 0)} shipped`,
        entries: `${String(entries['cached'] ?? 0)} cached · ${String(entries['bundled'] ?? 0)} from bundles`,
        shells: `${String(figures['shells'] ?? 0)}`,
        sync: sync['at'] === 0 ? 'no pull yet' : `${reports.filter((r) => r['ok'] === true).length}/${reports.length} landed`,
      },
    };
  },
});

// The resolver's verdict in words, and a colour. Same job the app's own format
// prism does for its panes — spelled here because this tool reads the rows raw
// rather than through a vex mapping.
const STATE_TEXT: Record<string, string> = {
  live: 'Live',
  connector: 'Not in the live integration',
  property: 'Switched off by the property',
  source: 'Integration not run here',
  disabled: 'Withdrawn by us',
};

// The stay states the app's own slots are written against. Asked rather than
// read, so the pane never touches a hotel's stay.
const STAY_STATES = ['any', 'booked', 'arriving', 'in_house', 'departed'];

// The resolver's reason turned into the sentence that answers "why not". Same
// facts as STATE_TEXT below, said as an explanation rather than a label.
const REASON_TEXT: Record<string, string> = {
  disabled: 'We withdrew this surface from the whole estate. Nothing a connector or a hotel does will bring it back.',
  connector: 'No connector this property runs currently offers the capability it needs.',
  property: 'A connector offers it, but this property has the capability switched off.',
  source: 'It was shipped by an integration this property does not run.',
};

// ── reading one run's exchange ──────────────────────────────
//
// The turns are moss's own shape, stored as JSON on the row. Parsed, never cast:
// a record written by an older build is a real possibility, and a pane that
// throws on one loses the other 199 rows.
const Turns = z.array(
  z.object({
    role: z.string(),
    content: z.string().default(''),
    name: z.string().optional(),
    calls: z.array(z.object({ name: z.string(), args: z.string().default('') })).optional(),
  }),
);

type Turn = z.infer<typeof Turns>[number];

const readTurns = (json: string): Turn[] => {
  try {
    const parsed = Turns.safeParse(JSON.parse(json === '' ? '[]' : json));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
};

// Arguments arrive as the provider sent them: a JSON string. Pretty-printed when
// it parses, left exactly as it came when it does not — a malformed call is the
// most interesting thing in a transcript and must not be tidied into looking fine.
const readArgs = (args: string): string => {
  try {
    return JSON.stringify(JSON.parse(args), null, 2);
  } catch {
    return args;
  }
};

// THE PROMPT, as one text. Every turn that carried words, in order, each under
// the role that said it — the same thing a person would paste into a playground.
// Nothing is folded in here that is not language: a tool call is machinery, and
// interleaving it turns the one artifact worth reading straight through into a
// log.
const promptText = (turns: readonly Turn[]): string =>
  turns
    .filter((turn) => turn.content !== '')
    .map((turn) => `[${turn.role}${turn.name === undefined ? '' : `: ${turn.name}`}]\n${turn.content}`)
    .join('\n\n');

// THE TOOL CALLS, separately: what was asked for and what came back. The record
// keeps a call and its result as two turns, in the order the model saw them;
// pairing them is this pane's business, and it pairs by position because that is
// the order the loop ran them in.
//
// A call with no result is left saying so rather than dropped — a tool that never
// answered is the most useful thing a transcript can tell you.
const toolCalls = (turns: readonly Turn[]): Row[] => {
  const results = turns.filter((turn) => turn.role === 'tool');
  let taken = 0;
  const out: Row[] = [];
  for (const turn of turns) {
    for (const call of turn.calls ?? []) {
      const answer = results[taken];
      taken += 1;
      out.push({
        id: `${out.length}`,
        name: call.name,
        args: readArgs(call.args),
        result: answer === undefined ? '(no result recorded — this call was never answered)' : answer.content,
      });
    }
  }
  return out;
};

// How long ago, said the way a person would.
const since = (ms: number): string => {
  const seconds = Math.round(ms / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes}m ago` : `${Math.round(minutes / 60)}h ago`;
};

const STATE_TONE: Record<string, string> = {
  live: 'good',
  connector: 'warn',
  property: 'neutral',
  source: 'neutral',
  disabled: 'alert',
};
