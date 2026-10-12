import type { FunctionHandler } from '@niscorp/nova';
import type { Tide } from '@niscorp/tide';
import type { FunctionSession } from '@niscorp/moss';
import { effectById, momentById, nameOf, reflexIdFor, selectionFor } from '@lyra/app/reflexes/compose';
import { askAsAutomation } from '../tide';
import { evaluate } from '@niscorp/prism';
import { RECIPES } from '@lyra/app/reflexes/recipes';

type Deps = { tide: () => Tide; driver: () => import('@niscorp/tide').TideDriver; server: () => import('@niscorp/moss').MossServer };

const mine = (studioId: string, reflexId: string): boolean => reflexId.startsWith(`${studioId}:`);

export const automationFunctions = (session: FunctionSession, deps: Deps): Record<string, FunctionHandler> => {
  const studioOf = async (): Promise<string> => String(session.identity['studioId'] ?? '');

  const watchedOf = async (studioId: string, reflexId: string): Promise<boolean> => {
    const response = await session.wire('/api/automation/vex', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fingerprint: 'automations/list', context: {} }) });
    if (!response.ok) return false;
    const rows = (await response.json()) as unknown;
    const automationId = reflexId.slice(studioId.length + 1);
    const row = Array.isArray(rows) ? (rows as { automation_id?: unknown; watched?: unknown }[]).find((r) => String(r.automation_id ?? '') === automationId) : undefined;
    return row?.watched === true;
  };

  return {
  'automations.preview': async (data) => {
    const studioId = await studioOf();
    const reflexId = String(data['reflexId'] ?? '');
    if (!mine(studioId, reflexId)) throw new Error('That automation is not yours.');
    if (await watchedOf(studioId, reflexId)) {
      return {
        summary: 'Runs as it happens — the moment its write lands, anchored to the person it concerns. The card shows how it last ran.',
        anyone: false,
        hint: '',
        units: [],
      };
    }
    const report = await deps.tide().preview(reflexId, { now: Date.now() });

    const text = (value: unknown): string => (typeof value === 'string' ? value : '');
    const units = report.units.map((u) => {
      const input = (u.input ?? {}) as Record<string, unknown>;
      const row = ((u.env as Record<string, unknown> | undefined)?.['row'] ?? {}) as Record<string, unknown>;
      const who = text(row['person_name']) || text(input['toAddress']) || u.unit;
      return {
        unit: u.unit,
        who,
        to: text(row['email']) || text(input['toAddress']),
        subject: text(input['subject']) || text(input['title']) || text(input['tag']),
        body: text(input['body']) || text(input['detail']),
        note: typeof u.render === 'string' ? u.render : '',
        error: u.error ?? '',
      };
    });

    const n = report.selected;
    return {
      summary: n === 0 ? 'Nobody is due right now — nothing would go out.' : n === 1 ? 'One person is due. This is what they would get:' : `${n} people are due. This is what they would get:`,
      anyone: n > 0,
      hint: n === 0 ? 'Come back when somebody is due, or change the window.' : '',
      units,
    };
  },

  // Named `sendAgain` because the obvious verb is the mail provider's name, and
  // `mail-check` asserts that name appears in exactly one file.
  'automations.sendAgain': async (data) => {
    const studioId = await studioOf();
    const messageId = String(data['messageId'] ?? '');
    if (studioId === '' || messageId === '') throw new Error('Nothing to send again.');
    // The scope policy makes this safe, not the check above: the requeue runs as
    // the studio's own principal, so another studio's message id matches no row.
    await askAsAutomation(deps.server(), studioId, 'outbox/requeue', { messageId, failedReason: 'sending again, asked by the studio' });
    const driver = deps.driver();
    await driver.fire(`${studioId}:outbox-sweep`, { now: Date.now(), by: 'operator' });
    await driver.wake();
    return { sent: true };
  },

  'automations.run': async (data) => {
    const studioId = await studioOf();
    const reflexId = String(data['reflexId'] ?? '');
    if (!mine(studioId, reflexId)) throw new Error('That automation is not yours.');
    if (await watchedOf(studioId, reflexId)) {
      throw new Error('This one runs by itself — the moment its write lands. There is nothing to run by hand.');
    }
    const driver = deps.driver();
    await driver.fire(reflexId, { now: Date.now(), by: String(data['by'] ?? 'operator') });
    await driver.wake();
    return { ran: true };
  },

  'automations.audience': async (data) => {
    const studioId = await studioOf();
    const moment = momentById(String(data['moment'] ?? ''));
    if (studioId === '' || moment === undefined) return { known: false, tone: 'neutral', summary: '', names: '' };

    if (moment.watch !== undefined) {
      return { known: true, tone: 'good', summary: `Runs as it happens — every time ${moment.label}.`, names: '' };
    }

    const row = { id: '', moment: moment.id, effect: '', enabled: true, run_at: '09:00', days: Number(data['days'] ?? 7) || 7, subject: '', body: '' };
    const query = selectionFor(moment, row);
    const context = evaluate(query.context as never, { now: Date.now() } as never) as Record<string, unknown>;

    try {
      const body = await askAsAutomation(deps.server(), studioId, query.fingerprint, context);
      const rows = body !== null && typeof body === 'object' && 'result' in body ? (body as { result: unknown }).result : body;
      const people = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
      const named = people.map((r) => String(r['person_name'] ?? '')).filter((name) => name !== '');
      return {
        known: true,
        tone: people.length === 0 ? 'warm' : 'good',
        summary:
          people.length === 0
            ? 'Nobody matches this right now. It will still run — but check the number before you rely on it.'
            : people.length === 1
              ? 'One person matches this right now.'
              : `${people.length} people match this right now.`,
        names: named.slice(0, 4).join(', ') + (named.length > 4 ? ` and ${named.length - 4} more` : ''),
      };
    } catch (error) {
      return {
        known: true,
        tone: 'alert',
        summary: 'This automation cannot run: it reads something the studio’s automations are not allowed to see.',
        names: String(error instanceof Error ? error.message : error).slice(0, 160),
      };
    }
  },

  };
};
