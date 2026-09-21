// THE PERMISSION CHECK — an action a principal lacks is never a question.
//
// The vendor liaison types the operator's exact sentence. The claim is not that
// the slot swap is refused, hidden or filtered out of an answer: it is that
// nothing about it ever leaves the process. The questions are derived from the
// liaison's RESOLVED catalog, so there is no `action/slot.swap` for a model to
// say yes to, no act list fetched to fill it with, and no row of the bill in
// the request at all.
//
// The operator runs alongside as the control. An absence only means something
// next to a presence: same server, same sentence, same provider.
import { LIAISON_PRINCIPAL, OPERATOR_PRINCIPAL } from '@encore/app/charter/assignments';
import { QUESTION_CANVASES } from '@encore/app/canvas-placement';
import { check, login, mounted, passesOf, report, servedTo, settle, typeLine } from './world';

const SENTENCE = 'storm at 9 move headliner to the tent';
const PREFIXES = ['storm at 9 move', 'storm at 9 move headliner', SENTENCE];

const main = async (): Promise<void> => {
  const liaison = await login(LIAISON_PRINCIPAL);
  const operator = await login(OPERATOR_PRINCIPAL);
  await settle();

  // ═══ 1. the liaison's room, through the whole sentence ═══
  const everMounted = new Set<string>();
  for (const prefix of PREFIXES) {
    await typeLine(LIAISON_PRINCIPAL, prefix);
    for (const canvas of QUESTION_CANVASES) for (const id of mounted(liaison, canvas)) everMounted.add(id);
  }
  check(`the slot swap never mounted for the liaison (saw: ${[...everMounted].join(', ') || 'nothing'})`, !everMounted.has('slot.swap'));
  check('...nor anything else from the bill', !['act.card', 'lineup.timeline', 'set.delay', 'stage.view', 'weather.radar'].some((id) => everMounted.has(id)));

  // ═══ 2. and the reason: it was never asked ═══════════════
  const liaisonPasses = passesOf(LIAISON_PRINCIPAL);
  const asked = new Set(liaisonPasses.flatMap((pass) => pass.questionNames));
  check(`the liaison's passes ran (${liaisonPasses.length}) and asked questions (${asked.size})`, liaisonPasses.length >= 1 && asked.size > 0);
  check('no question naming slot.swap was ever derived', ![...asked].some((name) => name.includes('slot.swap')));
  check('...and none over acts or stages — tables no action of theirs references', ![...asked].some((name) => /\/(actId|highlightActId|stageId|fromStageId|toStageId)$/.test(name)));
  check('what they DO hold was asked about', asked.has('action/push.compose') && asked.has('action/sales.chart') && asked.has('action/site.map'));
  check('...including a row reference they are entitled to: the zone', [...asked].some((name) => name.endsWith('/focusZoneId') || name.endsWith('/zoneId')));

  // Nothing about the bill reached the terminal either — not in a card, a chip
  // or the trace.
  const wire = servedTo(LIAISON_PRINCIPAL).join('\n');
  check('nothing served to the liaison names the swap or the headliner', !wire.includes('slot.swap') && !wire.includes('Nova Kestrel') && !wire.includes('act_nova_kestrel'));

  // ═══ 3. the control ══════════════════════════════════════
  await typeLine(OPERATOR_PRINCIPAL, SENTENCE);
  const operatorAsked = new Set(passesOf(OPERATOR_PRINCIPAL).flatMap((pass) => pass.questionNames));
  check('the operator, same sentence, WAS asked about the swap', operatorAsked.has('action/slot.swap') && [...operatorAsked].some((name) => name === 'input/slot.swap/toStageId'));
  check('...and got it', mounted(operator, 'doing').includes('slot.swap'));
  check(`...on a wider pass (${operatorAsked.size} questions against ${asked.size})`, operatorAsked.size > asked.size);

  // Two rooms, one server: the operator's pass changed nothing for the liaison.
  check('the liaison still holds no swap after the operator got one', !mounted(liaison, 'doing').includes('slot.swap'));

  // ═══ 4. a forged chip cannot promote what is not held ════
  // A chip carries an action id back from a terminal, and a terminal can send
  // any string.
  const strip = liaison.getState().canvases['maybe']?.active;
  if (strip !== undefined) liaison.dispatch({ type: 'ui:click', ref: 'chip', payload: 'slot.swap', origin: strip.id });
  await settle(4);
  await typeLine(LIAISON_PRINCIPAL, SENTENCE);
  check('promoting "slot.swap" by hand mounts nothing', !mounted(liaison, 'doing').includes('slot.swap'));

  await report('permission-check');
};

void main();
