import { createSignal } from '@niscorp/signal';
import { createDecider } from '@encore/server/decider/decider';
import { openConnectionsTo } from '@encore/server/keep-warm';
import { FAKE_MODEL, startFakeProvider } from '@encore/server/decider/fake-provider';
import { connectionsOpened, installWarmDispatcher } from '@encore/server/keep-warm';

const results: boolean[] = [];
const check = (label: string, pass: boolean): void => {
  results.push(pass);
  console.log(`${pass ? '[pass]' : '[fail]'} ${label}`);
};

const near = (value: number, target: number): boolean => Math.abs(value - target) < 1e-9;
const sumOf = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0);

const QUESTIONS = {
  stage: {
    type: 'choice',
    instructions: 'The stage the act is moving to.',
    criteria: { stage_main: 'Main Stage — open-air stage', stage_tent: 'The Tent — covered stage', none: 'Not said, or none of these.' },
  },
  origin: {
    type: 'choice',
    instructions: 'The stage the act is moving from.',
    criteria: { stage_main: 'Main Stage — open-air stage', stage_tent: 'The Tent — covered stage', none: 'Not said, or none of these.' },
  },
  radar: { type: 'noul', instructions: 'Does this card belong on screen?', criteria: { true: 'The weather radar — rain, wind and storm cells.', false: 'Unrelated.' } },
  sales: { type: 'noul', instructions: 'Does this card belong on screen?', criteria: { true: 'A chart of bar takings by the hour.', false: 'Unrelated.' } },
  urgency: { type: 'score', instructions: 'How urgent is it?', criteria: ['routine', 'important', 'critical'] },
} as const;

// Node's built-in fetch hangs up an idle connection after about four seconds.
// Longer than that, so the default dispatcher would drop it.
const IDLE_GAP_MS = 4_600;

const main = async (): Promise<void> => {
  installWarmDispatcher();
  const provider = await startFakeProvider({ port: 0, latencyMs: 0, noulFloor: 0 });
  const signal = createSignal({ baseUrl: provider.baseUrl, apiKey: 'check', model: FAKE_MODEL, adapter: 'systemone' });
  check('signal sees a decision provider, not a chat one', signal.describe().kind === 'decisions');

  const result = await signal.decide({ state: { line: 'storm at 9 move headliner to the tent' }, questions: QUESTIONS });
  check('the round trip is accepted by signal\'s gate, calibrated', result.calibrated);
  if (result.calibrated) {
    const { stage, origin, radar, sales, urgency } = result.decisions;
    check(`"to the tent" picks the tent (${stage.choice}, ${stage.confidence.toFixed(2)})`, stage.choice === 'stage_tent' && stage.confidence >= 0.6);
    check(`...but does NOT fill "moving FROM" with it (${origin.choice}, ${origin.confidence.toFixed(2)})`, origin.choice === 'none' || origin.confidence < 0.6);
    check('a choice is a distribution over exactly its options, summing to 1', near(sumOf(Object.values(stage.probabilities)), 1) && Object.keys(stage.probabilities).length === 3);
    check(`"storm" lights the radar (${radar.noul.toFixed(2)}) and not the bar chart (${sales.noul.toFixed(2)})`, radar.noul >= 0.8 && sales.noul < 0.3);
    check(`a storm is not routine (level ${urgency.level}, score ${urgency.score.toFixed(2)})`, urgency.level >= 1 && near(sumOf(urgency.probabilities), 1));
  }
  check('usage is reported, so the trace has a number to show', result.meta.usage.reported && result.meta.usage.inputTokens > 0 && result.meta.usage.outputTokens === 0);
  check('the provider names its model', result.meta.model === FAKE_MODEL);

  const empty = await signal.decide({ state: { line: '' }, questions: QUESTIONS });
  if (empty.calibrated) {
    check('nothing said: every choice is `none`', empty.decisions.stage.choice === 'none' && empty.decisions.origin.choice === 'none');
    check('...every card is at zero', empty.decisions.radar.noul === 0 && empty.decisions.sales.noul === 0);
    check('...and the room is calm', empty.decisions.urgency.level === 0);
  } else check('the empty pass is calibrated', false);

  check('with no none on offer, an empty line falls back to the FIRST option', (await signal.decide({ state: { line: '' }, questions: { pick: { type: 'choice', instructions: 'Which?', criteria: { first: 'The first.', second: 'The second.' } } } })).decisions['pick']?.choice === 'first');

  const STAGES = { 'input/to': { type: 'choice', instructions: 'The stage the act is moving to. Which of these rows?', criteria: { stage_tent: 'The Tent — covered stage', stage_grove: 'The Grove — open-air stage', none: 'None of these is meant.' } } } as const;
  const stageFor = async (line: string): Promise<{ choice: string; p: number }> => {
    const answer = await signal.decide({ state: { line, heard: {} }, questions: STAGES });
    const picked = answer.calibrated ? answer.decisions['input/to'] : undefined;
    return { choice: picked?.choice ?? '', p: picked === undefined ? 0 : (picked.probabilities[picked.choice] ?? 0) };
  };
  const toTheTent = await stageFor('move headliner to the tent');
  const corrected = await stageFor('move headliner to the tent no the grove');
  const unrelated = await stageFor('not now, move headliner to the tent');
  check(`the scorer has NO correction cue: "…to the tent" → ${toTheTent.choice}; handed BOTH stages, "…to the tent no the grove" is undecided (${corrected.choice} ${corrected.p.toFixed(2)}) — too unsure to fill a field`, toTheTent.choice === 'stage_tent' && corrected.p < 0.6);
  check(`...and a "not" that corrects nothing about stages leaves the stage alone (${unrelated.choice})`, unrelated.choice === 'stage_tent' && unrelated.p >= 0.6);

  // The plain fake answers an unrelated question with zero; a calibrated model almost
  // never does. The floor lets a check exercise a rule against the second kind.
  const middling = await createDecider({ kind: 'fake', port: 0, latencyMs: 0, noulFloor: 0.4 }, {});
  const lifted = await middling.signal.decide({ state: { line: 'weather radar at 9' }, questions: { 'action/radar': { type: 'noul', instructions: 'Belongs?', criteria: { true: 'Weather radar and the headliner.', false: 'No.' } }, 'action/other': { type: 'noul', instructions: 'Belongs?', criteria: { true: 'Ticket sales by hour.', false: 'No.' } } } });
  const plain = await signal.decide({ state: { line: 'weather radar at 9' }, questions: { 'action/other': { type: 'noul', instructions: 'Belongs?', criteria: { true: 'Ticket sales by hour.', false: 'No.' } } } });
  check(`with a floor, NOTHING is zero: an unrelated card is a ${lifted.calibrated ? lifted.decisions['action/other'].noul.toFixed(2) : '?'} guess (plain fake: ${plain.calibrated ? plain.decisions['action/other'].noul.toFixed(2) : '?'}), and a sure one is still sure`, lifted.calibrated && plain.calibrated && plain.decisions['action/other'].noul === 0 && lifted.decisions['action/other'].noul === 0.4 && lifted.decisions['action/radar'].noul > 0.8);
  await middling.close();

  const racing = await createDecider({ kind: 'fake', port: 0, latencyMs: 250, noulFloor: 0 }, {});
  const warmUp = racing.warm();
  const waitedMs = await racing.ready();
  await racing.signal.decide({ state: 'first pass', questions: { q: { type: 'noul', instructions: 'Reply yes.' } } });
  check(`a pass that arrives DURING a warm-up waits for it (${Math.round(waitedMs)} ms) and rides its socket — one connection, not two`, (await warmUp).outcome === 'warmed' && waitedMs >= 200 && waitedMs < 1000 && openConnectionsTo(`http://127.0.0.1:${racing.id.split('@')[1] ?? ''}/v1`) === 1);
  check('...and with a socket open, another warm-up is not sent: "fresh" is a fact about the socket, not a guess about the clock', (await racing.warm()).outcome === 'fresh' && (await racing.ready()) === 0);
  await racing.close();
  await new Promise((resolve) => setTimeout(resolve, 150));
  check('...while a socket the FAR END closed is known to be gone — so the next warm-up is real', openConnectionsTo(`http://127.0.0.1:${racing.id.split('@')[1] ?? ''}/v1`) === 0);

  const again = await signal.decide({ state: { line: 'storm at 9 move headliner to the tent' }, questions: QUESTIONS });
  check('the same sentence gets the same answer, to the last digit', JSON.stringify(again.decisions) === JSON.stringify(result.decisions));

  const bare = await fetch(`${provider.baseUrl}/systemone`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  check(`a request with no bearer is refused (${bare.status})`, bare.status === 401);
  const malformed = await fetch(`${provider.baseUrl}/systemone`, { method: 'POST', headers: { authorization: 'Bearer x', 'content-type': 'application/json' }, body: '{"questions":7}' });
  check(`a malformed body is a 400, not a guess (${malformed.status})`, malformed.status === 400);
  await provider.close();

  const slow = await startFakeProvider({ port: 0, latencyMs: 120 });
  const slowSignal = createSignal({ baseUrl: slow.baseUrl, apiKey: 'check', model: FAKE_MODEL, adapter: 'systemone' });
  const timed = await slowSignal.decide({ state: 'storm', questions: QUESTIONS });
  check(`ENCORE_DECIDER_LATENCY_MS holds the answer back (${Math.round(timed.meta.durationMs)} ms)`, timed.meta.durationMs >= 110);
  await slow.close();

  const idle = await startFakeProvider({ port: 0, latencyMs: 0, noulFloor: 0 });
  const idleSignal = createSignal({ baseUrl: idle.baseUrl, apiKey: 'check', model: FAKE_MODEL, adapter: 'systemone' });
  const openedBefore = connectionsOpened();
  await idleSignal.decide({ state: 'storm', questions: QUESTIONS });
  check('the first request opens a connection, and the client notices', idle.connections() === 1 && connectionsOpened() === openedBefore + 1);
  await new Promise((resolve) => setTimeout(resolve, IDLE_GAP_MS));
  await idleSignal.decide({ state: 'storm', questions: QUESTIONS });
  check(`after ${IDLE_GAP_MS} ms idle the next request REUSES it (server saw ${idle.connections()} connection(s))`, idle.connections() === 1 && connectionsOpened() === openedBefore + 1);
  await idle.close();

  const decider = await createDecider({ kind: 'fake', port: 0, latencyMs: 0, noulFloor: 0 }, {});
  const first = await decider.warm();
  const second = await decider.warm();
  check(`a pre-warm opens the connection (${first.outcome}, ${first.ms.toFixed(0)} ms) and a second one straight after is not sent (${second.outcome})`, first.outcome === 'warmed' && second.outcome === 'fresh');
  await decider.close();
  const dead = await createDecider({ kind: 'fake', port: 0, latencyMs: 0, noulFloor: 0 }, {});
  await dead.close();
  const swallowed = await dead.warm();
  check(`a pre-warm against a provider that is down is swallowed and reported, never thrown (${swallowed.outcome})`, swallowed.outcome === 'failed');

  const failed = results.filter((ok) => !ok).length;
  console.log(failed === 0 ? `\nOK — decider-check (${results.length} assertions)` : `\nFAIL — ${failed} of ${results.length} assertions failed in decider-check`);
  process.exit(failed === 0 ? 0 : 1);
};

void main();
