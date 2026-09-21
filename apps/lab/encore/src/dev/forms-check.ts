// THE `do` FORMS — every write closes through the database, and says who.
//
// The storm check moves a set. This covers the other two forms and the things
// one sentence cannot: a second sentence (so the loop is not a storm-sentence
// machine), a duration read by the parser, an act found by NAME rather than by
// billing, and the engine — not the form — stamping who pressed the button.
import { LIAISON_PRINCIPAL, OPERATOR_PRINCIPAL } from '@encore/app/charter/assignments';
import { asPrincipal, cardData, check, login, mounted, report, settle, sql, typeLine } from './world';

const main = async (): Promise<void> => {
  const operator = await login(OPERATOR_PRINCIPAL);
  const liaison = await login(LIAISON_PRINCIPAL);
  await settle();

  const click = async (shell: typeof operator, canvas: string, actionId: string, ref: string): Promise<void> => {
    const instance = shell.getState().canvases[canvas]?.stack.find((item) => item.definitionId === actionId);
    if (instance !== undefined) shell.dispatch({ type: 'ui:click', ref, origin: instance.id });
    await settle(12);
  };

  // ═══ 1. a different sentence: a hold ═════════════════════
  await typeLine(OPERATOR_PRINCIPAL, 'delay lantern club 20 min');
  check(`"delay lantern club 20 min" opens the delay form (${mounted(operator, 'doing').join(', ')})`, mounted(operator, 'doing').includes('set.delay'));
  const hold = cardData(operator, 'doing', 'set.delay');
  check('...the act found by NAME, out of two candidates sharing the word "club"', hold['actId'] === 'act_lantern_club');
  check('...twenty minutes read by the parser — as a number, not a time', hold['minutes'] === 20);
  check('...and the storm-sentence cards are nowhere', !mounted(operator, 'doing').includes('slot.swap') && !mounted(operator, 'when').includes('weather.radar'));

  check('nothing is written until somebody presses', (await sql(`SELECT count(*)::int AS n FROM delays`))[0]?.['n'] === 0);
  await click(operator, 'doing', 'set.delay', 'submit');
  const delay = (await sql(`SELECT act_id, minutes, created_by FROM delays`))[0];
  check('pressing it records the hold', delay?.['act_id'] === 'act_lantern_club' && delay?.['minutes'] === 20);
  check('...stamped with the operator by the ENGINE — the form has no such field', delay?.['created_by'] === OPERATOR_PRINCIPAL);
  check('...and the form says so', cardData(operator, 'doing', 'set.delay')['saved'] === true);

  // A viewer hears it: the act card lists the holds called on its act.
  operator.push('about', 'act.card', { actId: 'act_lantern_club' });
  await settle(10);
  check('the act card, opened afterwards, shows the hold', JSON.stringify(cardData(operator, 'about', 'act.card')['delays'] ?? []).includes('"minutes":20'));
  await typeLine(OPERATOR_PRINCIPAL, '');

  // ═══ 2. a push, from the narrower principal ══════════════
  await typeLine(LIAISON_PRINCIPAL, 'warn the vendors urgent');
  check(`the liaison's "warn the vendors urgent" opens the push form (${mounted(liaison, 'doing').join(', ')})`, mounted(liaison, 'doing').includes('push.compose'));
  const push = cardData(liaison, 'doing', 'push.compose');
  check('...audience picked from the enum: vendors', push['audience'] === 'vendors');
  check('...the draft is their own sentence, since the model writes no strings', push['body'] === 'warn the vendors urgent');
  check(`...urgency scored above routine (${String(push['urgency'])})`, typeof push['urgency'] === 'number' && push['urgency'] >= 1);

  await click(liaison, 'doing', 'push.compose', 'submit');
  const sent = (await sql(`SELECT audience, body, created_by FROM pushes`))[0];
  check('pressing send records the push', sent?.['audience'] === 'vendors' && sent?.['body'] === 'warn the vendors urgent');
  check('...stamped with the LIAISON, not whoever a body might claim', sent?.['created_by'] === LIAISON_PRINCIPAL);
  check('...and the form re-read its own ledger', JSON.stringify(cardData(liaison, 'doing', 'push.compose')['recent'] ?? []).includes('warn the vendors urgent'));

  // ═══ 3. the writes a role does not hold ══════════════════
  // Asserted on the RAW wire, as the liaison, because that is the boundary —
  // not what their shell happens to offer.
  const forged = await asPrincipal(LIAISON_PRINCIPAL, '/api/lineup/vex', { fingerprint: 'delays/add', context: { actId: 'act_nova_kestrel', minutes: 60 } });
  check(`the liaison cannot call a hold by hand-crafting the request (${forged.status})`, forged.status >= 400 && (await sql(`SELECT count(*)::int AS n FROM delays`))[0]?.['n'] === 1);
  const swap = await asPrincipal(LIAISON_PRINCIPAL, '/api/lineup/vex', { fingerprint: 'slots/swap', context: { actId: 'act_nova_kestrel', day: 'sat', fromStageId: 'stage_main', toStageId: 'stage_tent', time: '21:00' } });
  check(`...nor move the headliner (${swap.status})`, swap.status >= 400 && (await sql(`SELECT stage_id FROM slots WHERE act_id = 'act_nova_kestrel'`))[0]?.['stage_id'] === 'stage_main');
  const spoofed = await asPrincipal(OPERATOR_PRINCIPAL, '/api/ledger/vex', { fingerprint: 'pushes/send', context: { audience: 'crew', urgency: 0, body: 'spoof', created_by: 'somebody_else' } });
  const spoofRow = (await sql(`SELECT created_by FROM pushes WHERE body = 'spoof'`))[0];
  check(`a body that names its own author is ignored or refused — never believed (${spoofed.status})`, spoofRow === undefined || spoofRow['created_by'] === OPERATOR_PRINCIPAL);

  await report('forms-check');
};

void main();
