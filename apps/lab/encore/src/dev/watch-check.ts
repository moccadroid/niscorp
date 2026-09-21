// THE ROOM WATCHES — scene 4, with nobody typing.
//
// A director writes through the server's own door as its own principal; moss
// says THAT a table was written; each live session re-reads what changed under
// its own policy and puts it to Jev as an EVENT. Driven on the fake providers
// with the fake's `noulFloor` at 0.4 THROUGHOUT: every rule here is a threshold,
// and a threshold that only holds against a model that answers zero is the
// mistake this app has made three times. Under the floor a routine event is a
// 0.4 "maybe worth a look", every card is a 0.4 guess — and nothing may rise.
//
//   a. a routine event raises nothing, and is counted as triaged
//   b. Food Court 91% → 96% raises crowd.gauge, aimed at the Food Court
//   c. scanner down + 96% → ONE brief, naming both
//   d. a burst of 300 scans is ONE pass
//   e. a sentence typed mid-stream is untouched and undelayed
//   f. a click is a label, with the raising pass's probabilities
//   g. a closed incident takes its card down
//   h. more than four raises fold into a counted line — raised all the same
//   i. flagged events are turns: on the rail, and in the agent's thread
//   j. the liaison gets crowd events and is never shown, or asked about, an incident
//   k. the brief's rate limit, and the operator's run coming first
//   l. the law: an event pass writes nothing
import { z } from 'zod';
import { LIAISON_PRINCIPAL, OPERATOR_PRINCIPAL } from '@encore/app/charter/assignments';
import { feedOpenIncident, feedScan, feedSetCount, feedSetIncidentStatus, feedSetScanner } from '@encore/app/vex/watch.entries';
import type { FakeAgentControls } from '@encore/server/agent/fake-llm';
import { ATTENTION_SHOWN, BRIEF_EVERY_MS, INTERRUPT_AT } from '@encore/server/watch/watch';
import { cardData, createReporter, createWorld, mounted, settle } from './world-factory';

const { check, report } = createReporter();

const FLOOR = 0.4;
const QUESTION_CANVASES = ['doing', 'about', 'where', 'when', 'nearby'] as const;

const Probabilities = z.record(z.string(), z.number());
const Entries = z.array(z.object({ by: z.string(), line: z.string(), full: z.string() }).loose());

const main = async (): Promise<void> => {
  let nowMs = 1_000_000;
  const controls: FakeAgentControls = { latencyMs: 0, chunkMs: 0, seen: [] };
  const world = await createWorld({ agent: { kind: 'fake', fake: controls }, decider: { noulFloor: FLOOR }, now: () => nowMs });
  const OP = OPERATOR_PRINCIPAL;
  const shell = await world.login(OP);
  const liaisonShell = await world.login(LIAISON_PRINCIPAL);
  await settle();
  const director = world.booted.director;
  const watcher = world.booted.intent.of(OP)?.watching();
  const liaisonWatcher = world.booted.intent.of(LIAISON_PRINCIPAL)?.watching();
  if (watcher === undefined || liaisonWatcher === undefined) throw new Error('watch-check: a session has no watcher');
  const strip = (): Record<string, unknown> => cardData(shell, 'watch', 'attention.strip');
  const tone = (): unknown => cardData(shell, 'line', 'intent.line')['tone'];
  const room = (): string => QUESTION_CANVASES.map((canvas) => (shell.getState().canvases[canvas]?.stack ?? []).map((item) => `${item.definitionId}#${item.id}`).join('+')).join(' | ');
  const bothSettled = async (): Promise<void> => {
    await settle(6);
    await world.settled(OP);
    await world.settled(LIAISON_PRINCIPAL);
    await settle(4);
  };
  const setCount = (zoneId: string, headcount: number): Promise<void> => director.send({ what: `${zoneId} → ${headcount}`, fingerprint: feedSetCount.fingerprint, context: { zoneId, day: 'sat', hour: 18, headcount } });
  const countsBefore = await world.tableCounts();
  const IDLE_WITH_DECK = 'Nothing needs attention right now. Say what is happening, or press play.';
  const idleSays = (room: typeof shell): unknown => cardData(room, 'maybe', 'intent.options')['idle'];
  const served = (room: string, actionId: string): string => world.servedTo(room).filter((message) => message.includes(`"definitionId":"${actionId}"`)).at(-1) ?? '';

  // (2026-09-21, the surface: the trace, the deck and the rail's role tags are
  // LAYER THREE. This check reads them off the rendering, so the operator's room
  // runs with x-ray ON from here; what the APP shows with it off is surface-check's.)
  await world.xray(OP);

  // ═══ what am I looking at? — the room before anything has happened ═══
  check(`AN IDLE ROOM SAYS SO, in one quiet sentence: "${String(idleSays(shell))}"`, String(idleSays(shell)).startsWith('Nothing needs attention right now. Say what is happening') && served(OP, 'intent.options').includes('Nothing needs attention right now'));
  check('...and offers the director only to somebody who holds its deck', !String(idleSays(liaisonShell)).includes('press play') && mounted(liaisonShell, 'deck').length === 0 && mounted(shell, 'deck').join() === 'director.deck');
  check('THE TRACE HAS A ZERO STATE: before any pass it draws one muted line — no zeros, no "calibrated false"', served(OP, 'intent.trace').includes('no sentence yet') && !served(OP, 'intent.trace').toLowerCase().includes('calibrated') && !served(OP, 'intent.trace').includes('"label":"PASS"') && !served(OP, 'intent.trace').includes('"label":"pass"'));
  check('the director’s deck says it is ready, and offers play', JSON.stringify(cardData(shell, 'deck', 'director.deck')['deck']).includes('"status":"ready"') && served(OP, 'director.deck').includes('"label":"play"'));

  // ═══ a. routine ══════════════════════════════════════════
  await setCount('zone_arena', 6980);
  await bothSettled();
  check(`a routine event — Main Arena 26% → 28% — is asked about and answered NOTHING (${JSON.stringify(watcher.stats())})`, watcher.stats().events === 1 && watcher.stats().passes === 1 && watcher.stats().nothing === 1 && watcher.stats().raised === 0 && mounted(shell, 'attention').length === 0);
  // (Restated 2026-09-21: the strip's line did not add up — a cause re-asked while
  // its card stood, or one that left, was an event and neither "raised" nor
  // "nothing". It now names all four things an event can be.)
  check(`...and COUNTED, because that is the product: "${String(strip()['say'])}"`, strip()['say'] === '1 event · 0 raised · 1 nothing · 0 already up · 0 left');
  check(`...under a model with a ${FLOOR} opinion of everything: "worth a look?" came back ${FLOOR}, under the ${INTERRUPT_AT} line`, (world.booted.decider.fakeMiddling?.floor ?? 0) === FLOOR && tone() === 'calm');

  // ═══ d. a burst is one pass ══════════════════════════════
  const beforeBurst = watcher.stats();
  const framesBeforeBurst = world.servedTo(OP).length;
  for (let batch = 0; batch < 12; batch += 1) void director.send({ what: '25 scans', fingerprint: feedScan.fingerprint, context: { gateId: 'gate_west', day: 'sat', minute: 1082, scans: 25 } });
  await director.send({ what: 'the last 25', fingerprint: feedScan.fingerprint, context: { gateId: 'gate_west', day: 'sat', minute: 1082, scans: 25 } });
  await bothSettled();
  const afterBurst = watcher.stats();
  const framesInBurst = world.servedTo(OP).length - framesBeforeBurst;
  const burstBody = (world.booted.decider.fakeSeen?.() ?? []).filter((body) => body.includes('tickets scanned')).at(-1) ?? '';
  check(`A BURST OF SCANS IS ONE STATE AND ONE PASS: ${afterBurst.rows - beforeBurst.rows} rows written, ${afterBurst.events - beforeBurst.events} event, ${afterBurst.passes - beforeBurst.passes} pass`, afterBurst.rows - beforeBurst.rows === 13 && afterBurst.events - beforeBurst.events === 1 && afterBurst.passes - beforeBurst.passes === 1 && afterBurst.raised === 0);
  check(`...and a burst of scans re-reads NO card and costs the terminal ${framesInBurst} frame(s): nothing on screen shows a scan`, Object.keys(world.booted.intent.of(OP)?.reloading().published() ?? {}).length === 0 && framesInBurst <= 2);
  check('...Jev was asked about "West Gate: 325 tickets scanned in the last minute", once', burstBody.includes('West Gate: 325 tickets scanned in the last minute'));

  // ═══ b + c. scanner down, then the Food Court goes over ══
  await director.send({ what: 'West Gate scanners fail', fingerprint: feedSetScanner.fingerprint, context: { gateId: 'gate_west', ok: false } });
  await bothSettled();
  check('...and the idle sentence is gone the moment a card goes up', idleSays(shell) === '');
  check(`a scanner down is a WARNING: a card goes up (${mounted(shell, 'attention').join(', ')}), the frame goes ${String(tone())} — and the agent is not called`, mounted(shell, 'attention').length === 1 && tone() === 'elevated' && watcher.stats().briefs === 0 && controls.seen.length === 0);
  const roomBefore = room();
  await setCount('zone_food', 5760);
  await bothSettled();
  const gauge = cardData(shell, 'attention', 'crowd.gauge');
  check(`FOOD COURT 91% → 96% RAISES crowd.gauge on \`attention\`, aimed at the Food Court (${mounted(shell, 'attention').join(', ')})`, mounted(shell, 'attention').includes('crowd.gauge') && gauge['zoneId'] === 'zone_food' && gauge['hour'] === 18);
  check(`...wearing what happened and how sure Jev was: "${String(gauge['causeLine']).slice(0, 70)}…" [${String(gauge['raisedBand'])}, ${String(gauge['raisedBy'])}]`, String(gauge['causeLine']).includes('Food Court crowding: 96% of capacity') && gauge['raisedBand'] === 'critical' && String(gauge['raisedBy']).startsWith('jev 0.9'));
  check('...and the frame goes critical: the louder of the sentence’s tone and the festival’s', tone() === 'critical');
  // THE CARD UNDER THE ALERT IS NOT STALE (seen live: "96%" over a gauge reading
  // 93%). It was on screen BEFORE the count moved; it re-read when it did.
  const GaugeCount = z.object({ headcount: z.number() }).loose();
  check(`the gauge under that header READS WHAT THE HEADER SAYS: ${JSON.stringify(gauge['count'])}`, GaugeCount.safeParse(gauge['count']).data?.headcount === 5760);
  check(`ONE BRIEF, and it names BOTH: "${String(strip()['brief'])}"`, watcher.stats().briefs === 1 && String(strip()['brief']).includes('Food Court') && String(strip()['brief']).includes('West Gate') && world.booted.spent().filter((run) => run.label === 'brief:landed' && run.principal === OP).length === 1);
  const briefRequests = controls.seen.filter((request) => request.messages.some((message) => message.content.startsWith('JUST NOW: Food Court crowding')));
  const briefPrompt = briefRequests.find((request) => request.messages.some((message) => message.content.includes('West Gate')))?.messages.map((message) => message.content).join('\n') ?? '';
  check('...because the prompt held EVERY standing cause — in FACTS and in the last message, which is what a model answers — and asked for how they COMPOUND, not for the header again', briefPrompt.includes('"standing":[') && briefPrompt.includes('"place":"West Gate"') && briefPrompt.includes('"place":"Food Court"') && briefPrompt.includes('STANDING, all at once: West Gate') && briefPrompt.includes('compound') && briefPrompt.includes('do not restate the reading'));
  check(`...from the agent with NO tools and nothing it may name, handed the causes that are up — one request per watcher that may be briefed (${briefRequests.length})`, controls.seen.length === briefRequests.length && briefRequests.length === 2 && briefRequests.every((request) => request.tools.length === 0) && briefRequests.filter((request) => request.messages.some((message) => message.content.includes('West Gate'))).length === 1);
  check('AN EVENT PASS TOUCHES `attention` AND NOTHING ELSE: the five question canvases are exactly as they were', room() === roomBefore);

  // ═══ a write re-reads the cards that show it ═════════════
  // A gauge up BEFORE the write, the same instance after it, a new number in it.
  const gaugeInstance = (): string => shell.getState().canvases['attention']?.stack.find((item) => item.definitionId === 'crowd.gauge')?.id ?? '';
  const gaugeBefore = gaugeInstance();
  await setCount('zone_food', 5790);
  await bothSettled();
  check(`THE COUNT MOVES AND THE MOUNTED GAUGE MOVES WITH IT — re-read in place, the same instance (${JSON.stringify(cardData(shell, 'attention', 'crowd.gauge')['count'])})`, GaugeCount.safeParse(cardData(shell, 'attention', 'crowd.gauge')['count']).data?.headcount === 5790 && gaugeInstance() === gaugeBefore && gaugeBefore !== '');
  // Ten writes to one zone inside a breath: the first re-reads at once, the rest
  // become ONE more.
  const beforeThrash = world.booted.intent.of(OP)?.reloading().published()['crowd.gauge'] ?? 0;
  for (let step = 1; step <= 10; step += 1) void setCount('zone_food', 5790 + step);
  await bothSettled();
  const thrash = (world.booted.intent.of(OP)?.reloading().published()['crowd.gauge'] ?? 0) - beforeThrash;
  check(`RELOADS ARE THROTTLED PER CARD: ten writes in a burst re-read the gauge ${thrash} time(s) — the first at once, the rest as one — and it ends on the last value`, thrash >= 1 && thrash <= 2 && GaugeCount.safeParse(cardData(shell, 'attention', 'crowd.gauge')['count']).data?.headcount === 5800);
  await setCount('zone_food', 5762);
  await bothSettled();

  // ═══ k. the brief's rate limit, and the operator first ═══
  // (Counted from HERE: the writes above were critical events too, and each of
  // them found the ten-second limit in its way.)
  const skippedSoFar = watcher.stats().briefsSkipped;
  await setCount('zone_grove', 3900);
  await bothSettled();
  check(`a second critical event inside ${BRIEF_EVERY_MS / 1000} s raises its card and gets NO brief (${watcher.stats().briefs} briefs, ${watcher.stats().briefsSkipped} skipped)`, watcher.raised().some((entry) => entry.cause === 'crowd:zone_grove') && watcher.stats().briefs === 1 && watcher.stats().briefsSkipped === skippedSoFar + 1);
  nowMs += BRIEF_EVERY_MS + 1;
  controls.latencyMs = 900;
  await world.typeLine(OP, "what's going on?");
  const runsOut = async (): Promise<boolean> => {
    for (let tries = 0; tries < 100; tries += 1) {
      if (world.runsOf(OP).at(-1)?.status === 'running') return true;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return false;
  };
  const isOut = await runsOut();
  await setCount('zone_dock', 2450);
  await settle(12);
  check('ten seconds on, a critical event arrives while THE OPERATOR’S RUN IS OUT: its card goes up, and the brief stands aside', isOut && watcher.raised().some((entry) => entry.cause === 'crowd:zone_dock') && watcher.stats().briefs === 1 && watcher.stats().briefsSkipped === skippedSoFar + 2);
  await world.settled(OP);
  controls.latencyMs = 0;
  check('...the operator’s answer landed as it always does', world.runsOf(OP).at(-1)?.status === 'landed' && world.runsOf(OP).at(-1)?.mode === 'ask');
  await world.typeLine(OP, '');
  await bothSettled();

  // ═══ e. a sentence, mid-stream ═══════════════════════════
  const latency = world.booted.decider.fakeLatency;
  if (latency === undefined) throw new Error('watch-check: the decider has no latency knob');
  latency.ms = 150;
  const passesBeforeStream = watcher.stats().passes;
  for (const [zone, headcount] of [['zone_arena', 7100], ['zone_tent', 4950], ['zone_camp', 9100], ['zone_arena', 7200], ['zone_grove', 3905], ['zone_dock', 2455], ['zone_food', 5765]] as const) void setCount(zone, headcount);
  await settle(3);
  const typedAt = performance.now();
  await world.typeLine(OP, 'move the headliner to the tent at 9');
  const sentencePass = world.passesOf(OP).at(-1);
  const landedAfter = performance.now() - typedAt;
  const eventPassesThen = watcher.stats().passes - passesBeforeStream;
  await bothSettled();
  const eventPassesInAll = watcher.stats().passes - passesBeforeStream;
  check(`A SENTENCE IS NEVER QUEUED BEHIND EVENTS: typed into a stream of ${eventPassesInAll} event passes at 150 ms each, its pass waited ${Math.round(sentencePass?.waitedMs ?? 0)} ms (the pacer’s own quiet) and took ${Math.round(sentencePass?.totalMs ?? 0)} ms`, (sentencePass?.totalMs ?? 9999) < 330 && eventPassesInAll >= 5 && eventPassesThen < eventPassesInAll && landedAfter < 1500);
  check(`...and the room it built is the sentence’s: ${mounted(shell, 'doing').join(', ')} + ${mounted(shell, 'nearby').join(', ')}, untouched by the ${eventPassesInAll} event passes beside it`, mounted(shell, 'doing').includes('slot.swap') && mounted(shell, 'nearby').includes('move.impact') && !QUESTION_CANVASES.some((canvas) => (shell.getState().canvases[canvas]?.stack ?? []).some((item) => shell.originOf(item.id) === 'watch')));
  latency.ms = 0;
  await world.typeLine(OP, '');
  await bothSettled();

  // ═══ l. the law, measured before anybody clicks ══════════
  const countsAfterEvents = await world.tableCounts();
  const grew = Object.keys(countsAfterEvents).filter((table) => countsAfterEvents[table] !== countsBefore[table]).sort();
  check(`THE EVENT PATH WRITES NOTHING: after ${watcher.stats().passes} passes and ${watcher.stats().raised} raises the only tables that grew are the feed’s own and the thread (${grew.join(', ')}) — not one label`, grew.join() === 'agent_turns,gate_scans' && (countsAfterEvents['attention_labels'] ?? -1) === 0 && (countsAfterEvents['pushes'] ?? -1) === (countsBefore['pushes'] ?? -2));

  // ═══ f. a click is a label ═══════════════════════════════
  world.dispatchOn(OP, 'attention', { type: 'ui:click', ref: 'dismiss' }, 'crowd.gauge');
  await bothSettled();
  const labels = await world.sql('SELECT principal, verdict, action_id, cause, probabilities FROM attention_labels ORDER BY seq');
  const stored = Probabilities.safeParse(JSON.parse(String(labels[0]?.['probabilities'] ?? '{}')));
  check(`DISMISS IS A LABEL: one row, the operator’s, stamped by the engine (${String(labels[0]?.['verdict'])} ${String(labels[0]?.['action_id'])} for ${String(labels[0]?.['cause'])})`, labels.length === 1 && labels[0]?.['principal'] === OP && labels[0]?.['verdict'] === 'dismissed' && labels[0]?.['action_id'] === 'crowd.gauge' && String(labels[0]?.['cause']).startsWith('crowd:'));
  check(`...carrying the probabilities of THE PASS THAT RAISED IT: ${JSON.stringify(stored.success ? stored.data : {})}`, stored.success && (stored.data['event/interrupt'] ?? 0) >= INTERRUPT_AT && (stored.data['action/crowd.gauge'] ?? 0) >= 0.8 && stored.data['event/urgency'] !== undefined);
  const dismissedCause = String(labels[0]?.['cause']);
  check('...and the card comes down', !watcher.raised().some((entry) => entry.cause === dismissedCause));
  const zoneOf = dismissedCause.slice('crowd:'.length);
  const Headcount = z.object({ headcount: z.number() });
  const held = Headcount.parse((await world.sql('SELECT headcount FROM zone_counts WHERE zone_id = $1 AND day = $2 AND hour = 18', [zoneOf, 'sat']))[0]);
  await setCount(zoneOf, held.headcount + 1);
  await bothSettled();
  check('a dismissal means "I have seen THIS": the same reading, one head later, does not put it back', !watcher.raised().some((entry) => entry.cause === dismissedCause));
  world.dispatchOn(OP, 'attention', { type: 'ui:click', ref: 'keep' }, 'site.map');
  await bothSettled();
  const kept = await world.sql(`SELECT verdict, cause FROM attention_labels WHERE verdict = 'kept'`);
  check('KEEP is a label too, and the card stays', kept.length === 1 && String(kept[0]?.['cause']).startsWith('gate:') && mounted(shell, 'attention').includes('site.map') && cardData(shell, 'attention', 'site.map')['labelled'] === 'kept');

  // ═══ g. a closed incident ════════════════════════════════
  await director.send({ what: 'a fall', fingerprint: feedOpenIncident.fingerprint, context: { id: 'inc_check_1', day: 'sat', at: '18:30', zoneId: 'zone_grove', kind: 'medical', severity: 2, summary: 'Guest fell from the riser; conscious, medics on the way.' } });
  await bothSettled();
  check(`an incident raises the incident feed (${watcher.raised().map((entry) => `${entry.cause}→${entry.actionId}`).join(', ')})`, watcher.raised().some((entry) => entry.cause === 'incident:inc_check_1' && entry.actionId === 'incident.feed'));
  await director.send({ what: 'dealt with', fingerprint: feedSetIncidentStatus.fingerprint, context: { id: 'inc_check_1', status: 'closed' } });
  await bothSettled();
  check('CLOSED: its cause has left, and the card with it — nobody was asked', !watcher.raised().some((entry) => entry.cause === 'incident:inc_check_1'));

  // A card a SENTENCE opened re-reads too: the incident list, up before the row.
  await world.typeLine(OP, 'open incidents');
  const feedInstance = (): string => shell.getState().canvases['nearby']?.stack.find((item) => item.definitionId === 'incident.feed')?.id ?? '';
  const feedBefore = feedInstance();
  const listed = (): string => JSON.stringify(cardData(shell, 'nearby', 'incident.feed')['incidents']);
  const listedBefore = listed();
  await director.send({ what: 'a fault is logged', fingerprint: feedOpenIncident.fingerprint, context: { id: 'inc_check_2', day: 'sat', at: '18:35', zoneId: 'zone_food', kind: 'technical', severity: 2, summary: 'West Gate scanners down; the queue is not moving.' } });
  await bothSettled();
  check('A NEW INCIDENT ROW IS IN THE MOUNTED INCIDENT LIST — on a canvas the sentence arranged, in the same instance, without a keystroke', feedBefore !== '' && feedInstance() === feedBefore && !listedBefore.includes('queue is not moving') && listed().includes('West Gate scanners down; the queue is not moving.'));
  await director.send({ what: 'closed', fingerprint: feedSetIncidentStatus.fingerprint, context: { id: 'inc_check_2', status: 'closed' } });
  await bothSettled();
  check('...and leaves it when it is closed', !listed().includes('queue is not moving'));
  await world.typeLine(OP, '');
  await bothSettled();

  // ═══ j. the liaison ══════════════════════════════════════
  const bodies = world.booted.decider.fakeSeen?.() ?? [];
  const askedAboutTheFall = bodies.filter((body) => body.includes('Guest fell from the riser')).length;
  const askedAboutTheCourt = bodies.filter((body) => body.includes('Food Court crowding: 96% of capacity (5,760 of 6,000)')).length;
  check(`THE LIAISON IS TOLD WHEN THE FOOD COURT FILLS (${liaisonWatcher.raised().map((entry) => entry.cause).join(', ')}) — Jev was asked about it twice, once per watcher (${askedAboutTheCourt})`, liaisonWatcher.raised().some((entry) => entry.cause.startsWith('crowd:')) && mounted(liaisonShell, 'attention').length > 0 && askedAboutTheCourt === 2);
  check(`...and is NEVER SHOWN, OR ASKED ABOUT, AN INCIDENT: Jev was asked about the fall exactly once, by the operator’s session (${askedAboutTheFall})`, askedAboutTheFall === 1 && !liaisonWatcher.raised().some((entry) => entry.cause.startsWith('incident:') || entry.cause.startsWith('gate:')) && !mounted(liaisonShell, 'attention').includes('incident.feed'));
  check('...with no code that says so: their policy cannot read the incident log or the gates, so those feeds were never re-read for them', liaisonWatcher.stats().events < watcher.stats().events && (await world.asPrincipal(LIAISON_PRINCIPAL, '/api/vex', { fingerprint: 'feed/incidents', context: { after: 0 } })).status !== 200);

  // ═══ h. more than four ═══════════════════════════════════
  for (const [zone, headcount] of [['zone_arena', 24500], ['zone_tent', 8800], ['zone_camp', 17600], ['zone_dock', 2460], ['zone_grove', 3950]] as const) await setCount(zone, headcount);
  await bothSettled();
  const raisedNow = watcher.raised().length;
  check(`${raisedNow} causes are raised and ${mounted(shell, 'attention').length} cards show: the cap is on the DISPLAY`, raisedNow > ATTENTION_SHOWN && mounted(shell, 'attention').length === ATTENTION_SHOWN);
  check(`...the rest fold into one counted line: "${String(strip()['foldedSay'])}"`, strip()['folded'] === raisedNow - ATTENTION_SHOWN && String(strip()['foldedSay']).startsWith(`+${raisedNow - ATTENTION_SHOWN} more raised`));

  // ═══ i. flagged events are turns ═════════════════════════
  const rail = Entries.parse(cardData(shell, 'rail', 'assist.rail')['entries'] ?? []);
  const flagged = rail.filter((entry) => entry.by === 'event');
  check(`every raise is on the rail, as what it was (${flagged.length}: "${flagged.at(-1)?.line}")`, flagged.length === watcher.stats().raised && flagged.some((entry) => /^18:00 · Food Court 96% — raised$/.test(entry.line)));
  const turnRows = await world.sql(`SELECT detail FROM agent_turns WHERE principal = $1 AND role = 'event' ORDER BY seq LIMIT 1`, [OP]);
  check('...stored with the probabilities of the pass that raised it', String(turnRows[0]?.['detail']).includes('"event/interrupt"') && String(turnRows[0]?.['detail']).includes('"probabilities"'));
  controls.seen.length = 0;
  await world.typeLine(OP, 'what did I miss?');
  await world.settled(OP);
  check('"what did I miss?" IS ANSWERABLE FROM THE THREAD: the agent was handed the raises as turns', world.runsOf(OP).at(-1)?.status === 'landed' && controls.seen.at(-1)?.messages.some((message) => message.content.startsWith('[event, nobody asked]') && message.content.includes('Food Court 96%')) === true);
  await world.typeLine(OP, '');
  await bothSettled();

  // ═══ tone decays; the clock is a row ═════════════════════
  for (const [zone, headcount] of [['zone_arena', 6500], ['zone_tent', 4800], ['zone_camp', 9000], ['zone_dock', 1100], ['zone_grove', 1900], ['zone_food', 4900]] as const) await setCount(zone, headcount);
  await director.send({ what: 'scanners back', fingerprint: feedSetScanner.fingerprint, context: { gateId: 'gate_west', ok: true } });
  await bothSettled();
  check('THE BRIEF LEAVES WITH ITS CAUSES: it was a sentence about a situation, and the situation is over', strip()['brief'] === '' && !served(OP, 'attention.strip').includes('"tone":"alert"'));
  check(`...and with nothing raised, nothing mounted and nothing typed, the room says so again: "${String(idleSays(shell))}"`, idleSays(shell) === IDLE_WITH_DECK);
  check(`THE CAUSES LEAVE AND THE CARDS WITH THEM (${watcher.raised().length} raised, ${watcher.stats().left} left in all) — and the frame’s tone decays to ${String(tone())}`, watcher.raised().length === 0 && mounted(shell, 'attention').length === 0 && tone() === 'calm');
  world.keystroke(OP, 's');
  await settle(1);
  check('...and stops saying it at the first key', idleSays(shell) === '');
  await world.typeLine(OP, 'storm at 9');
  check('...while a sentence that describes a storm still raises it by itself', tone() === 'elevated');
  // (Restated 2026-09-21, the surface: the trace is a drawer of five sections, each
  // ONE LINE until it is opened — so what a landed pass draws is its summaries, not
  // a KeyValue. Same claim: the zero state is gone and the pass is on the screen.)
  check('the trace draws its sections once a pass has landed', /Pass \d+ · \d+ ms · \d+ questions/.test(served(OP, 'intent.trace')) && served(OP, 'intent.trace').includes('▸ Probabilities') && !served(OP, 'intent.trace').includes('no sentence yet'));
  check(`THE RAIL HAS A HEADING, so a cold reader knows what the list is`, /"label":"Earlier · \d+"/.test(served(OP, 'assist.rail'))); // (2026-09-21: the heading is one plain word — and, since the redesign, the whole rail until it is pressed: "Earlier · n")
  await world.typeLine(OP, '');

  // A CARD THAT FOLLOWS THE CLOCK FOLLOWS THE ROW; one that was TOLD an hour
  // keeps it. Three cards up before the clock moves: a gauge the room raised, a
  // head count a sentence opened with no hour said, and the same card in the
  // liaison's room — aimed, by their sentence, at nine o'clock.
  await setCount('zone_food', 5760);
  await bothSettled();
  await world.typeLine(OP, 'how many guests are there right now?');
  await world.typeLine(LIAISON_PRINCIPAL, 'how many guests are there at 9');
  const instanceOf = (room: typeof shell, canvas: string, actionId: string): string => room.getState().canvases[canvas]?.stack.find((item) => item.definitionId === actionId)?.id ?? '';
  const raisedGauge = instanceOf(shell, 'attention', 'crowd.gauge');
  const headCount = instanceOf(shell, 'nearby', 'attendance.now');
  const toldNine = instanceOf(liaisonShell, 'nearby', 'attendance.now');
  check('before the clock moves: the raised gauge and the head count hold 18:00, the liaison’s holds the 21:00 they asked for', cardData(shell, 'attention', 'crowd.gauge')['hour'] === 18 && cardData(shell, 'nearby', 'attendance.now')['hour'] === 18 && cardData(liaisonShell, 'nearby', 'attendance.now')['hour'] === 21);
  await director.stepTo(19 * 60 + 5);
  await bothSettled();
  check('THE DIRECTOR ADVANCES THE CLOCK TO 19:05 AND THE CARDS THAT FOLLOW IT FOLLOW: the raised gauge and the head count read 19:00…', cardData(shell, 'attention', 'crowd.gauge')['hour'] === 19 && cardData(shell, 'nearby', 'attendance.now')['hour'] === 19);
  check('...RE-AIMED IN PLACE — the same two instances — and re-read for the new hour', instanceOf(shell, 'attention', 'crowd.gauge') === raisedGauge && raisedGauge !== '' && instanceOf(shell, 'nearby', 'attendance.now') === headCount && headCount !== '' && JSON.stringify(cardData(shell, 'nearby', 'attendance.now')['total']) !== '{}');
  check('...while A CARD AIMED AT AN EXPLICIT HOUR DOES NOT DRIFT: "at 9" is still 21:00, in the same instance', cardData(liaisonShell, 'nearby', 'attendance.now')['hour'] === 21 && instanceOf(liaisonShell, 'nearby', 'attendance.now') === toldNine && toldNine !== '');
  await world.typeLine(LIAISON_PRINCIPAL, '');
  await world.typeLine(OP, '');
  await bothSettled();
  await world.typeLine(OP, 'how many guests are there right now?');
  check(`THE CLOCK IS A ROW: the director advanced it to 19:05 and "right now" is 19:00 for both speeds (${String(cardData(shell, 'nearby', 'attendance.now')['hour'])})`, cardData(shell, 'nearby', 'attendance.now')['hour'] === 19 && JSON.stringify(cardData(shell, 'deck', 'director.deck')['deck']).includes('"time":"19:05"'));
  await world.typeLine(OP, '');
  await bothSettled();

  const stats = watcher.stats();
  check(`THE STRIP ADDS UP: ${stats.events} events = ${stats.raised} raised + ${stats.nothing} nothing + ${stats.alreadyUp} already up + ${stats.left} left — "${String(strip()['say'])}"`, stats.events === stats.raised + stats.nothing + stats.alreadyUp + stats.left && stats.alreadyUp > 0 && stats.left > 0 && strip()['say'] === `${stats.events} events · ${stats.raised} raised · ${stats.nothing} nothing · ${stats.alreadyUp} already up · ${stats.left} left`);
  console.log(`       reloads published to the operator's cards, this suite: ${JSON.stringify(world.booted.intent.of(OP)?.reloading().published())}`);
  console.log(`\n       measured, this suite (operator's watcher): ${stats.rows} rows re-read → ${stats.events} events → ${stats.passes} passes · ${stats.raised} raised · ${stats.nothing} nothing · ${stats.left} left · ${stats.briefs} briefs (${stats.briefsSkipped} stood aside)`);

  // ═══ the ceiling, in a world where it bites ══════════════
  const tight = await createWorld({ agent: { kind: 'off' }, decider: { noulFloor: FLOOR }, eventPassesPerSecond: 2 });
  const tightShell = await tight.login(OP);
  await settle();
  const tightWatcher = tight.booted.intent.of(OP)?.watching();
  const began = performance.now();
  for (const [zone, headcount] of [['zone_arena', 7000], ['zone_tent', 4900], ['zone_camp', 9100], ['zone_dock', 1150], ['zone_grove', 1950]] as const) void tight.booted.director.send({ what: zone, fingerprint: feedSetCount.fingerprint, context: { zoneId: zone, day: 'sat', hour: 18, headcount } });
  await settle(6);
  await tight.settled(OP);
  const took = performance.now() - began;
  const tightStats = tightWatcher?.stats();
  check(`A CEILING ON EVENT PASSES PER SECOND, shared by every session: 5 events at 2 a second took ${(took / 1000).toFixed(1)} s (${((tightStats?.passes ?? 0) / (took / 1000)).toFixed(1)} passes/s)`, tightStats?.passes === 5 && took >= 1900 && (tightStats.deferred ?? 0) >= 2);
  check(`...and it SAYS SO when it bites: "${String(cardData(tightShell, 'watch', 'attention.strip')['ceilingSay'])}"`, String(cardData(tightShell, 'watch', 'attention.strip')['ceilingSay']).startsWith('ceiling held 2 passes back'));

  // ═══ measured: the whole evening ═════════════════════════
  const evening = await createWorld({ agent: { kind: 'fake', fake: { latencyMs: 0, chunkMs: 0, seen: [] } } });
  const eveningShell = await evening.login(OP);
  await settle();
  const eveningWatcher = evening.booted.intent.of(OP)?.watching();
  const cues = evening.booted.director.cues();
  // Play sets the scene first — the evening's start, written by the feed — so a
  // first play and a replay are the same evening. A check that steps does it by hand.
  await evening.booted.director.reset();
  await settle(8);
  await evening.settled(OP);
  const eveningBegan = performance.now();
  for (let minute = 18 * 60 + 1; minute <= 19 * 60 + 5; minute += 1) {
    await evening.booted.director.stepTo(minute);
    if (cues.some((cue) => cue.at === minute)) {
      await settle(6);
      await evening.settled(OP);
    }
  }
  await settle(6);
  await evening.settled(OP);
  const played = eveningWatcher?.stats();
  console.log(`       measured, the director's Saturday evening (plain fake): ${cues.length} cues → ${played?.rows} rows re-read → ${played?.events} events → ${played?.passes} passes · ${played?.raised} raised · ${played?.nothing} nothing · ${played?.left} left · ${played?.briefs} brief(s) · ${((performance.now() - eveningBegan) / 1000).toFixed(1)} s\n`);
  const eveningStrip = cardData(eveningShell, 'watch', 'attention.strip');
  const raisesOf = async (): Promise<string[]> => (await evening.sql(`SELECT body FROM agent_turns WHERE role = 'event' ORDER BY seq`)).map((row) => String(row['body']));
  const firstPlay = await raisesOf();
  check(`AFTER THE EVENING HAS PLAYED TO THE END NO BRIEF IS ON SCREEN: every cause left (${eveningWatcher?.raised().length} raised), so the line about them did too — "${String(eveningStrip['brief'])}"`, eveningWatcher?.raised().length === 0 && eveningStrip['brief'] === '' && played?.briefs === 1 && cardData(eveningShell, 'line', 'intent.line')['tone'] === 'calm');
  check(`A FINISHED DIRECTOR SAYS SO: ${JSON.stringify(evening.booted.director.state())}`, evening.booted.director.state().finished && evening.booted.director.state().status === 'finished');
  await evening.xray(OP);
  evening.dispatchOn(OP, 'deck', { type: 'ui:click', ref: 'pause' });
  await settle(4);
  check('...on the deck too, where `play` has become `replay`', JSON.stringify(cardData(eveningShell, 'deck', 'director.deck')['deck']).includes('"status":"finished"') && evening.servedTo(OP).filter((message) => message.includes('"definitionId":"director.deck"')).at(-1)?.includes('"label":"replay"') === true);

  // REPLAY: the feed puts the evening back — through its own mutations, as its
  // own principal — and plays it again.
  await evening.booted.director.reset();
  await settle(8);
  await evening.settled(OP);
  const foodAtStart = (await evening.sql(`SELECT headcount FROM zone_counts WHERE zone_id = 'zone_food' AND day = 'sat' AND hour = 18`))[0]?.['headcount'];
  const clockAtStart = (await evening.sql(`SELECT minute FROM festival_clock`))[0]?.['minute'];
  const stillOpen = (await evening.sql(`SELECT count(*)::int AS n FROM incidents WHERE id LIKE 'inc_live%' AND status = 'open'`))[0]?.['n'];
  check(`RESET puts the site back where the evening found it: Food Court ${String(foodAtStart)} at 18:00, the clock at ${String(clockAtStart)} minutes, every incident it opened closed, every scanner working`, foodAtStart === 5444 && clockAtStart === 18 * 60 && stillOpen === 0 && (await evening.sql(`SELECT count(*)::int AS n FROM gates WHERE scanner_ok = false`))[0]?.['n'] === 0 && evening.booted.director.state().status === 'ready');
  for (let minute = 18 * 60 + 1; minute <= 19 * 60 + 5; minute += 1) {
    await evening.booted.director.stepTo(minute);
    if (cues.some((cue) => cue.at === minute)) {
      await settle(6);
      await evening.settled(OP);
    }
  }
  await settle(6);
  await evening.settled(OP);
  const secondPlay = (await raisesOf()).slice(firstPlay.length);
  check(`A REPLAY PRODUCES THE SAME RAISES AS THE FIRST PLAY (${secondPlay.length}: ${secondPlay.join(' | ')})`, firstPlay.length >= 3 && JSON.stringify(secondPlay) === JSON.stringify(firstPlay) && eveningWatcher?.raised().length === 0 && cardData(eveningShell, 'watch', 'attention.strip')['brief'] === '');
  check(`the evening plays: ${cues.length} cues, ${played?.events} events, and nearly all of them nothing (${played?.nothing} of ${played?.passes} passes)`, played !== undefined && played.events >= 14 && played.passes < cues.length / 3 && played.nothing > played.raised && played.raised >= 3 && played.briefs === 1 && evening.booted.director.state().played === cues.length);

  await report('watch-check', [world, tight, evening]);
};

void main();
