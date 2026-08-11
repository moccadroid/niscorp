import type { FunctionHandler } from '@niscorp/nova';
import type { Tide } from '@niscorp/tide';
import type { FunctionSession } from '@niscorp/moss';
import { personById } from '../users';
import { reloadReflexes } from '../boot';
import { AUDIENCES, EFFECTS, audienceById, effectById, nameOf, pairs, reflexIdFor } from '@lyra/app/reflexes/compose';

// THE OPERATOR'S WINDOW ONTO THE AUTOMATIONS.
//
// These are `fn:` endpoints rather than vex entries, and the reason is a
// property of the store rather than a preference: tide's ledger lives in a
// MEMORY store, so there are no tables for vex to introspect and no rows for a
// fingerprint to name. Swap in `createPostgresStore` and every screen below
// becomes an ordinary read over ordinary rows — which is what tide's design
// says a moss host should do, and the reason `arm`, `fire` and `preview` are
// worth building as UI at all.
//
// Recorded as the one place in this application where a `fn:` reads instead of
// writes. It is not a discipline break so much as a thing the discipline
// cannot reach yet, and the fix is a store, not a rewrite.
//
// TENANCY. Every handler takes the caller's studio and filters reflex ids on
// it — the ids are prefixed `<studioId>:`, which is what the reflex templates
// mint. This is the one boundary in Lyra NOT enforced by the engine, because
// the ledger is not in the database the engine guards. It is therefore checked
// here, in one place, and asserted in `automations-check`. When the ledger
// becomes rows, this function disappears and the behaviors take over.
type Deps = { tide: () => Tide };

const mine = (studioId: string, reflexId: string): boolean => reflexId.startsWith(`${studioId}:`);

export const automationFunctions = (session: FunctionSession, deps: Deps & { pool: import('@niscorp/vex').PgPool }): Record<string, FunctionHandler> => {
  // THE STUDIO COMES FROM THE SESSION, never from the request.
  //
  // An earlier draft took it from the action data, which would have been both
  // forgeable and broken: `inputs` seeds only the boot-mounted action, so a
  // navigated-to screen would have carried an empty string. Reading the
  // principal here is the same derivation `scope()` does for the engine.
  const studioOf = (): string => personById(session.principal)?.studioId ?? '';

  return {
    // What this studio's automations are, and how they last ran.
  'automations.overview': async (data) => {
    const studioId = studioOf();
    if (studioId === '') throw new Error('No studio.');
    const tide = deps.tide();

    const firings = await tide.ledger.firings({ limit: 200 });
    const ours = firings.filter((f) => mine(studioId, f.reflexId));

    // One row per reflex, newest firing folded in. The operator's question is
    // "is this working", which is a question about the LAST run rather than a
    // list of every run — the history hangs off the row when they ask for it.
    // ONE LIST, NOT TWO.
    //
    // This screen showed the same automations twice: a "Set up" table of rows
    // (what is configured) above a "What it does" table of reflexes (what is
    // loaded and how it last ran). Two tables, the same three automations, and
    // the controls split between them — you changed the schedule in the top
    // one and paused in the bottom one, with nothing saying so.
    //
    // They were never two things. A row IS the automation and a reflex is that
    // row loaded; the split was an artefact of two data sources, which is a
    // reason for ONE JOIN and not for two tables. Joined on the template,
    // because that is what the row names and what the reflex id ends with.
    const configured = await deps.pool.query(
      'SELECT id, audience, effect, run_at, trial_days, subject, body, enabled FROM automations WHERE studio_id = $1 ORDER BY run_at',
      [studioId],
    );

    const reflexes = (configured.rows as { id: string; audience: string; effect: string; run_at: string; trial_days: number; subject: string; body: string; enabled: boolean }[]).map((row) => {
      const reflexId = reflexIdFor(studioId, row);
      const reflex = tide.reflexes().find((r) => r.id === reflexId);
      const last = ours.find((f) => f.reflexId === reflexId);
      const state = last === undefined ? '' : String((last as { state?: unknown }).state ?? '');
      const stats = (last as { stats?: { done?: number; failed?: number; total?: number } } | undefined)?.stats;
      // THE NAME IS COMPOSED, not stored. It is what this row DOES — the
      // effect and the audience in the operator's language — so it stays true
      // when either half is changed and there is no name column to go stale.
      const audience = audienceById(row.audience);
      const effect = effectById(row.effect);
      const armed = reflex !== undefined && reflex.enabled !== false && row.enabled;
      return {
        automation_id: row.id,
        reflex_id: reflexId,
        audience: row.audience,
        effect: row.effect,
        name: nameOf(row),
        // ONE short sentence. The row already says what it does in its name;
        // this says what that MEANS. Concatenating both halves' blurbs made a
        // four-line cell that nobody reads — the long version belongs in the
        // form, where you are deciding, not in a table you are scanning.
        intent: effect === undefined || audience === undefined ? 'This pairing is not in this version.' : effect.blurb,
        run_at: row.run_at,
        run_display: `Runs at ${row.run_at}`,
        trial_days: row.trial_days,
        subject: row.subject,
        body: row.body,
        uses_trial_days: audience?.usesTrialDays === true,
        uses_message: effect?.usesMessage === true,
        enabled: armed,
        // Loaded but not armed, and configured but not loaded, are different
        // problems. Saying "Armed" for both hides the second one entirely.
        state_label: reflex === undefined ? 'Not loaded' : armed ? 'Armed' : 'Paused',
        state_tone: reflex === undefined ? 'warm' : armed ? 'good' : 'neutral',
        pause_label: armed ? 'Pause' : 'Arm',
        last_outcome: last === undefined ? 'Never run' : state === 'settled' ? `${stats?.done ?? 0} done` : state,
        last_tone: last === undefined ? 'neutral' : state === 'settled' ? 'good' : state === 'skipped' ? 'warm' : 'calm',
        failed: Number(stats?.failed ?? 0),
      };
    });

    // The ARRAY, not a wrapper: the endpoint targets `reflexes`, and returning
    // an object would set that key to a box containing the rows.
    return reflexes;
  },

  // A DRY RUN, which is the whole reason an operator can be trusted with this
  // screen. It runs the real pipeline against real data and stubs exactly one
  // function — the effect executor — so "what would tonight do" is answerable
  // without doing it.
  'automations.preview': async (data) => {
    const studioId = studioOf();
    const reflexId = String(data['reflexId'] ?? '');
    if (!mine(studioId, reflexId)) throw new Error('That automation is not yours.');
    const report = await deps.tide().preview(reflexId, { now: Date.now() });
    const units = report.units.map((u) => ({ unit: String((u as { unit?: unknown }).unit ?? '') }));
    return {
      summary: report.selected === 0 ? 'Nothing is due right now.' : `Would act on ${report.selected}, as ${report.cause}.`,
      units,
    };
  },

  // Running it now. Works on a disarmed reflex — arming gates triggers, not
  // people — which is what makes this safe to hand somebody: they can pause a
  // misbehaving automation and still run it by hand once they have looked.
  'automations.run': async (data) => {
    const studioId = studioOf();
    const reflexId = String(data['reflexId'] ?? '');
    if (!mine(studioId, reflexId)) throw new Error('That automation is not yours.');
    const tide = deps.tide();
    const now = Date.now();
    await tide.fire(reflexId, { now, by: String(data['by'] ?? 'operator') });
    // A chain advances one hop per tick, so a few passes let the digest that
    // watches this firing land before the screen re-reads.
    for (let i = 0; i < 4; i += 1) await tide.tick({ now: now + i });
    return { ran: true };
  },

  // The catalog a studio picks from. Shipped shapes, not free text — a row
  // naming anything else is refused at load.
  // THE TWO VOCABULARIES. A form asks who, then what — and the second list is
  // filtered by the first, because not every pairing is meaningful: marking a
  // trial lapsed needs a membership, so it cannot follow an audience of
  // bookings. Offering it anyway would let somebody build a combination that
  // selects nothing, forever, silently.
  'automations.audiences': async () => AUDIENCES.map((a) => ({ value: a.id, label: a.label })),

  'automations.effects': async (data) => {
    const audienceId = String(data['audience'] ?? '');
    return EFFECTS.filter((e) => e.appliesTo.includes(audienceId)).map((e) => ({ value: e.id, label: e.label }));
  },

  // WHAT THIS PAIRING ACTUALLY TAKES.
  //
  // The form used to show every knob for every automation, so picking a digest
  // still asked for a trial window. Which knobs exist is a property of the
  // PAIRING — the audience decides whether there is a window, the effect
  // decides whether there are words — and the form asks for exactly those.
  'automations.shape': async (data) => {
    const audience = audienceById(String(data['audience'] ?? ''));
    const effect = effectById(String(data['effect'] ?? ''));
    if (audience === undefined || effect === undefined) return { usesTrialDays: false, usesMessage: false, intent: '', valid: false };
    // RESOLVE THE EFFECT, do not just judge it.
    //
    // Changing the audience re-filters the effect list, and the previously
    // chosen effect can drop out of it — the select then DISPLAYED the only
    // remaining option while the model still held the old one, so the form said
    // 'that combination is not available' about a combination nobody had
    // chosen and the picker was showing something else. A list and a value that
    // disagree is worse than either being wrong.
    //
    // So this returns the effect that actually applies, and the caller sets it.
    const resolved = pairs(audience.id, effect.id) ? effect : EFFECTS.find((e) => e.appliesTo.includes(audience.id));
    if (resolved === undefined) return { usesTrialDays: audience.usesTrialDays, usesMessage: false, effect: '', intent: 'Nothing this version ships can act on that group yet.', valid: false };
    return {
      usesTrialDays: audience.usesTrialDays,
      usesMessage: resolved.usesMessage,
      effect: resolved.id,
      intent: `${resolved.blurb} ${audience.blurb}`,
      valid: true,
    };
  },

  // Rows changed, so the loaded reflexes are stale. Re-reading is the whole
  // point of them being rows: no release, no restart.
  'automations.reload': async () => ({ loaded: await reloadReflexes(deps.pool, deps.tide()) }),

  'automations.arm': async (data) => {
    const studioId = studioOf();
    const reflexId = String(data['reflexId'] ?? '');
    if (!mine(studioId, reflexId)) throw new Error('That automation is not yours.');
    const on = data['armOn'] === true;
    const tide = deps.tide();
    return { enabled: on ? tide.arm(reflexId) : !tide.disarm(reflexId) };
  },
  };
};
