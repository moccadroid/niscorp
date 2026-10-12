import { LIAISON_PRINCIPAL, OPERATOR_PRINCIPAL } from '@encore/app/charter/assignments';
import { CATALOG_DEFINITIONS } from '@encore/app/action-catalog';
import { QUESTION_CANVASES } from '@encore/app/canvas-placement';
import { NOTHING_ANSWERS, ONLY_GUESSES } from '@encore/server/intent/reconcile';
import type { FakeAgentControls } from '@encore/server/agent/fake-llm';
import { STORM_PLAN_STEPS, cardData, createReporter, createWorld, mounted, planOf, settle } from './world-factory';

const STORM_PLAN = 'storm at 9 what should we do with the headliner';
const QUESTION = 'how many guests are there right now?';
const STORM_CARDS = ['slot.swap', 'set.delay', 'push.compose', 'act.card', 'lineup.timeline', 'weather.radar', 'stage.view'];

const { check, report } = createReporter();

const main = async (): Promise<void> => {
  const controls: FakeAgentControls = { latencyMs: 0, chunkMs: 0, seen: [] };
  const world = await createWorld({ agent: { kind: 'fake', fake: controls } });
  const OP = OPERATOR_PRINCIPAL;
  const shell = await world.login(OP);
  await settle();
  const room = (): string[] => QUESTION_CANVASES.flatMap((canvas) => mounted(shell, canvas));
  const holding = (): { pinned: string[]; given: string[]; anchor: string } => world.booted.intent.of(OP)?.holding() ?? { pinned: [], given: [], anchor: '' };
  const strip = (): Record<string, unknown> => cardData(shell, 'maybe', 'intent.options');

  controls.script = planOf(STORM_PLAN_STEPS);
  await world.typeLine(OP, STORM_PLAN);
  await world.settled(OP);
  controls.script = undefined;
  const steps = cardData(shell, 'assist', 'assist.answer')['steps'];
  const swapStep = (Array.isArray(steps) ? steps : []).findIndex((step) => JSON.stringify(step).includes('Move a set'));
  world.dispatchOn(OP, 'assist', { type: 'ui:click', ref: 'step', payload: swapStep });
  await world.settled(OP);
  world.dispatchOn(OP, 'maybe', { type: 'ui:click', ref: 'chip', payload: 'site.map' });
  await world.settled(OP);
  check(`the storm plan landed, a step was pressed and a chip clicked (${room().join(', ')})`, mounted(shell, 'assist').join() === 'assist.answer' && room().includes('slot.swap') && room().includes('site.map'));
  check(`...so the loop is HOLDING things for this sentence (pinned: ${holding().pinned.join(', ')})`, holding().pinned.includes('slot.swap') && holding().pinned.includes('site.map') && holding().given.includes('slot.swap'));

  let wasEverEmpty = false;
  for (let length = 1; length <= QUESTION.length; length += 1) {
    const prefix = QUESTION.slice(0, length);
    wasEverEmpty = wasEverEmpty || prefix.trim() === '';
    world.keystroke(OP, prefix);
    if (length === 1) {
      await settle(1);
      check('the very first keystroke of a different sentence drops everything held', holding().pinned.length === 0 && holding().given.length === 0);
      check('...and the agent’s card with it', mounted(shell, 'assist').length === 0);
    }
  }
  await world.settled(OP);
  check('the line was never emptied', !wasEverEmpty);

  check('the old answer is gone: no steps on the card — whatever is there answers THIS sentence', (cardData(shell, 'assist', 'assist.answer')['steps'] ?? []).toString() === '' && world.runsOf(OP).at(-1)?.text === QUESTION);
  check(`no storm card remains on any canvas (the room: ${room().join(', ') || 'empty'})`, !room().some((id) => STORM_CARDS.includes(id)));
  check('nothing stays pinned, and nothing the plan gave a card is remembered', holding().pinned.length === 0 && holding().given.length === 0);

  check('the question is ANSWERED: attendance.now is mounted', mounted(shell, 'nearby').includes('attendance.now'));
  const attendance = cardData(shell, 'nearby', 'attendance.now');
  const total = attendance['total'];
  const headcount = typeof total === 'object' && total !== null && 'headcount' in total ? total.headcount : undefined;
  const capacity = typeof total === 'object' && total !== null && 'capacity' in total ? total.capacity : undefined;
  const truth = (await world.sql(`SELECT sum(c.headcount)::int AS people, sum(z.capacity)::int AS room FROM zone_counts c JOIN zones z ON z.id = c.zone_id WHERE c.day = 'sat' AND c.hour = 18`))[0];
  check(`...at the festival clock’s hour, with the site total the database agrees with (${String(headcount)} of ${String(capacity)})`, attendance['day'] === 'sat' && attendance['hour'] === 18 && headcount === truth?.['people'] && capacity === truth?.['room']);
  const zones = Array.isArray(attendance['zones']) ? attendance['zones'] : [];
  check(`...and every zone’s share, worded upstream ("${JSON.stringify(zones[0] ?? {}).match(/\d+% full/)?.[0] ?? ''}")`, zones.length === 6 && zones.every((zone) => /"fill_display":"\d+% full"/.test(JSON.stringify(zone))));
  check('it needs no row to be aimed, so nothing demotes it to a chip', !JSON.stringify(strip()['chips']).includes('attendance.now'));

  await world.typeLine(OP, 'how many guests are there at 9');
  check('"…at 9" re-aims it at 21:00 — the hour is read, not judged', cardData(shell, 'nearby', 'attendance.now')['hour'] === 21);

  const liaison = await world.login(LIAISON_PRINCIPAL);
  await settle();
  await world.typeLine(LIAISON_PRINCIPAL, QUESTION);
  check('the liaison holds it too, deliberately: footfall is a trader’s question', mounted(liaison, 'nearby').includes('attendance.now'));

  check(`every card says why it is there: "${String(cardData(shell, 'nearby', 'attendance.now')['placedBy'])}"`, /^jev [01]\.\d\d$/.test(String(cardData(shell, 'nearby', 'attendance.now')['placedBy'])));
  world.dispatchOn(OP, 'maybe', { type: 'ui:click', ref: 'chip', payload: 'sales.chart' });
  await world.settled(OP);
  check('...and a chip the operator clicked says "you"', cardData(shell, 'nearby', 'sales.chart')['placedBy'] === 'you');
  check('...carried by the shared fragment: no authored card knows the tag exists, and every served card wears the fragment’s chrome', !JSON.stringify(CATALOG_DEFINITIONS).includes('placedBy') && !JSON.stringify(CATALOG_DEFINITIONS).includes('"why"') && world.servedTo(OP).some((message) => message.includes('"definitionId":"sales.chart"') && message.includes('"name":"Tile"') && message.includes('"label":"why?"')));

  await world.typeLine(OP, 'qqq zzz');
  check(`a sentence nothing answers says so: "${String(strip()['say'])}"`, room().length === 0 && strip()['say'] === NOTHING_ANSWERS);
  // Half a word: enough for Jev to suspect two cards, not enough to open one.
  await world.typeLine(OP, 'head');
  const guesses = strip()['chips'];
  check(`chips and no cards says they are guesses: "${String(strip()['say'])}"`, room().length === 0 && Array.isArray(guesses) && guesses.length > 0 && strip()['say'] === ONLY_GUESSES);
  await world.typeLine(OP, 'storm at 9 move headliner to the tent');
  check('with cards up the room speaks for itself', room().length > 0 && strip()['say'] === '');
  await world.typeLine(OP, '');
  check('and a cleared line says nothing at all — nothing was asked', strip()['say'] === '' && room().length === 0);

  await report('typeover-check', [world]);
};

void main();
