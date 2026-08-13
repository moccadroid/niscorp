import type { FunctionHandler } from '@niscorp/nova';
import type { Tide } from '@niscorp/tide';
import type { FunctionSession } from '@niscorp/moss';
import { personCard } from '../lookup';
import { effectById, momentById, nameOf, reflexIdFor, selectionFor } from '@lyra/app/reflexes/compose';
import { askAsAutomation } from '../tide';
import { evaluate } from '@niscorp/prism';
import { RECIPES } from '@lyra/app/reflexes/recipes';

type Deps = { tide: () => Tide; driver: () => import('@niscorp/moss').TideDriver; server: () => import('@niscorp/moss').MossServer };

const mine = (studioId: string, reflexId: string): boolean => reflexId.startsWith(`${studioId}:`);

export const automationFunctions = (session: FunctionSession, deps: Deps & { pool: import('@niscorp/vex').PgPool }): Record<string, FunctionHandler> => {
  const studioOf = async (): Promise<string> => (await personCard(deps.pool, session.principal ?? ''))?.studioId ?? '';

  // WHICH MOMENT THIS AUTOMATION IS, asked of the moment rather than of the
  // engine. Whether a thing runs on a write or on a clock is a property of
  // the MOMENT — `watch` is right there on it — and reading it back off the
  // loaded reflex's trigger asks a second source the same question, one that
  // is also empty for a beat after a reload.
  //
  // The reflex id IS `<studioId>:<automationId>`, read backwards.
  const momentOf = async (studioId: string, reflexId: string) => {
    const result = await deps.pool.query('SELECT moment FROM automations WHERE id = $1 AND studio_id = $2', [reflexId.slice(studioId.length + 1), studioId]);
    return momentById(String((result.rows[0] as { moment?: unknown } | undefined)?.moment ?? ''));
  };

  return {
  'automations.preview': async (data) => {
    const studioId = await studioOf();
    const reflexId = String(data['reflexId'] ?? '');
    if (!mine(studioId, reflexId)) throw new Error('That automation is not yours.');
    // A watched automation fires per write, anchored to the row that caused
    // it — with no write there is nothing to rehearse, and pretending would
    // mean answering a different question than the one it runs on.
    if ((await momentOf(studioId, reflexId))?.watch !== undefined) {
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
        // A pack's effect answers for itself; empty for a shipped one, where the
        // input above already says everything.
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

  // ── SEND IT AGAIN ────────────────────────────────────────────
  //
  // A studio looking at a failed message and deciding it was a blip. What it
  // NAMED `sendAgain` DELIBERATELY. The obvious English verb for this collides
  // with the mail provider's name, and `mail-check` asserts that name appears
  // in exactly one file — a dumb fence catching an ordinary word is a fence
  // working, not one to loosen. It also spares every future grep.
  //
  // What this does NOT do is grant a human the pen on the outbox: the requeue runs as
  // the studio's own automation principal — the only one that writes there —
  // so pressing this asks the robot to reconsider rather than widening a rung
  // to let somebody edit a row a robot wrote.
  //
  // Nothing here needs protecting from an impatient finger. Requeue only moves
  // a `failed` row, so a second press finds it `queued` and changes nothing;
  // the sweep it fires carries `overlap: 'skip'`, so a second firing while one
  // is running is dropped; and a message that failed for a permanent reason
  // fails again in the same words. The cost of leaning on it is one API call.
  'automations.sendAgain': async (data) => {
    const studioId = await studioOf();
    const messageId = String(data['messageId'] ?? '');
    if (studioId === '' || messageId === '') throw new Error('Nothing to send again.');
    // The scope policy is what makes this safe rather than the check above:
    // the requeue runs under the studio's own principal, so a message id from
    // somewhere else matches no row.
    await askAsAutomation(deps.server(), deps.pool, studioId, 'outbox/requeue', { messageId, failedReason: 'sending again, asked by the studio' });
    const driver = deps.driver();
    await driver.fire(`${studioId}:outbox-sweep`, { now: Date.now(), by: 'operator' });
    await driver.wake();
    return { sent: true };
  },

  'automations.run': async (data) => {
    const studioId = await studioOf();
    const reflexId = String(data['reflexId'] ?? '');
    if (!mine(studioId, reflexId)) throw new Error('That automation is not yours.');
    if ((await momentOf(studioId, reflexId))?.watch !== undefined) {
      throw new Error('This one runs by itself — the moment its write lands. There is nothing to run by hand.');
    }
    const driver = deps.driver();
    await driver.fire(reflexId, { now: Date.now(), by: String(data['by'] ?? 'operator') });
    // Join the drain: quiescence includes the whole chain (the digest that
    // watches this firing lands too), so the screen re-reads a settled world.
    await driver.wake();
    return { ran: true };
  },

  // WHO THIS WOULD REACH, WHILE YOU ARE STILL TYPING.
  //
  // The builder could compose and save an automation that reached nobody, and
  // two ways of doing it had both shipped: one whose selection matched no row
  // on any day of the year, and three whose selections the automation
  // principal is not granted to read at all — refused on every run, with the
  // refusal visible nowhere but a parked task.
  //
  // This runs the REAL selection, as the REAL principal, through the same
  // `selectionFor` the reflex uses. A grant that is missing shows up here as a
  // sentence in the form rather than as silence in production.
  'automations.audience': async (data) => {
    const studioId = await studioOf();
    const moment = momentById(String(data['moment'] ?? ''));
    if (studioId === '' || moment === undefined) return { known: false, tone: 'neutral', summary: '', names: '' };

    // A watched moment has no "due now" set to count — it fires per write,
    // anchored to the row that caused it, and its anchor refs only resolve
    // when a fact is in scope. "As it happens" is the honest answer; the
    // grant rehearsal below still runs for the clock moments, whose
    // selections are exactly what the reflex will ask.
    if (moment.watch !== undefined) {
      return { known: true, tone: 'good', summary: `Runs as it happens — every time ${moment.label}.`, names: '' };
    }

    const row = { id: '', moment: moment.id, effect: '', enabled: true, run_at: '09:00', days: Number(data['days'] ?? 7) || 7, subject: '', body: '' };
    const query = selectionFor(moment, row);
    // The context carries prism templates over `$.now` — the same ones tide
    // evaluates at fire time, evaluated here with the same evaluator so the
    // rehearsal cannot answer a different question from the automation.
    const context = evaluate(query.context as never, { now: Date.now() } as never) as Record<string, unknown>;

    try {
      const body = await askAsAutomation(deps.server(), deps.pool, studioId, query.fingerprint, context);
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
      // A REFUSAL IS THE ANSWER, not an error to swallow. This is the exact
      // shape three shipped moments were in, and the form now says so.
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
