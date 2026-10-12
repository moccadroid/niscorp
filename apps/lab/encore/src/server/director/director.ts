import { clockSet, feedOpenIncident, feedScan, feedSetCount, feedSetIncidentStatus, feedSetScanner } from '@encore/app/vex/watch.entries';
import { seededHeadcount } from '@encore/db/seed';

export type Cue = { at: number; what: string; fingerprint: string; context: Record<string, unknown> };

export type DirectorState = { playing: boolean; finished: boolean; status: string; speed: number; day: string; time: string; played: number; of: number };

export type Director = {
  play: () => void;
  pause: () => void;
  faster: () => void;
  slower: () => void;
  state: () => DirectorState;
  reset: () => Promise<void>;
  replay: () => void;
  stepTo: (minute: number) => Promise<void>;
  send: (cue: Omit<Cue, 'at'>) => Promise<void>;
  cues: () => readonly Cue[];
  close: () => void;
};

export type SendAsDirector = (body: { fingerprint: string; context: Record<string, unknown> }) => Promise<{ ok: boolean; status: number; text: string }>;

const DAY = 'sat';
const at = (time: string): number => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const timeOf = (minute: number): string => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

const count = (time: string, zoneId: string, headcount: number, what: string): Cue => ({ at: at(time), what, fingerprint: feedSetCount.fingerprint, context: { zoneId, day: DAY, hour: Math.floor(at(time) / 60), headcount } });
const scans = (time: string, gateId: string, batches: number, each: number): Cue[] =>
  Array.from({ length: batches }, (): Cue => ({ at: at(time), what: `${each} scans at ${gateId}`, fingerprint: feedScan.fingerprint, context: { gateId, day: DAY, minute: at(time), scans: each } }));

export const SATURDAY_EVENING: readonly Cue[] = [
  ...scans('18:02', 'gate_west', 12, 25),
  count('18:05', 'zone_arena', 6980, 'Main Arena drifts up two percent'),
  ...scans('18:08', 'gate_north', 8, 30),
  count('18:10', 'zone_tent', 4900, 'Tent Field drifts up'),
  count('18:14', 'zone_food', 5580, 'Food Court 93%'),
  ...scans('18:16', 'gate_west', 10, 25),
  { at: at('18:18'), what: 'West Gate scanners fail', fingerprint: feedSetScanner.fingerprint, context: { gateId: 'gate_west', ok: false } },
  { at: at('18:19'), what: 'the fault is logged', fingerprint: feedOpenIncident.fingerprint, context: { id: 'inc_live_scanner', day: DAY, at: '18:19', zoneId: 'zone_food', kind: 'technical', severity: 2, summary: 'West Gate scanners down; the gate is open and the queue into the Food Court is not moving.' } },
  count('18:22', 'zone_food', 5760, 'Food Court 96% — over the line, and its gate cannot clear'),
  ...scans('18:26', 'gate_south', 6, 20),
  { at: at('18:30'), what: 'a fall in The Grove', fingerprint: feedOpenIncident.fingerprint, context: { id: 'inc_live_001', day: DAY, at: '18:30', zoneId: 'zone_grove', kind: 'medical', severity: 2, summary: 'Guest fell from the sound desk riser; conscious, medics on the way — an injury.' } },
  count('18:34', 'zone_dock', 1180, 'Dockside drifts'),
  { at: at('18:40'), what: 'the fall is dealt with', fingerprint: feedSetIncidentStatus.fingerprint, context: { id: 'inc_live_001', status: 'closed' } },
  { at: at('18:46'), what: 'West Gate scanners back', fingerprint: feedSetScanner.fingerprint, context: { gateId: 'gate_west', ok: true } },
  { at: at('18:47'), what: 'the fault is closed', fingerprint: feedSetIncidentStatus.fingerprint, context: { id: 'inc_live_scanner', status: 'closed' } },
  ...scans('18:48', 'gate_west', 14, 25),
  count('18:55', 'zone_food', 5040, 'Food Court drains to 84%'),
  count('19:02', 'zone_arena', 9400, 'Main Arena fills for the evening'),
];

const SPEEDS = [1, 10, 60, 120, 300];
const TICK_MS = 250;
const START_MINUTE = 18 * 60;

export const createDirector = (send: SendAsDirector, script: readonly Cue[] = SATURDAY_EVENING): Director => {
  const cues = [...script].sort((a, b) => a.at - b.at);
  let played = 0;
  let minute = START_MINUTE;
  let exact = START_MINUTE;
  let speed = 60;
  let timer: ReturnType<typeof setInterval> | undefined;
  // An incident is a row with an id, and a replay's incident is a second row.
  let play = 1;
  let isSceneSet = false;
  const thisPlay = (cue: Omit<Cue, 'at'>): Omit<Cue, 'at'> => (play === 1 || typeof cue.context['id'] !== 'string' || cue.context['id'] === 'now' ? cue : { ...cue, context: { ...cue.context, id: `${cue.context['id']}_play${play}` } });
  let queue: Promise<void> = Promise.resolve();

  const dispatch = async (authored: Omit<Cue, 'at'>): Promise<void> => {
    const cue = thisPlay(authored);
    const reply = await send({ fingerprint: cue.fingerprint, context: cue.context });
    if (!reply.ok) console.error(`[encore/director] "${cue.what}" was refused (${reply.status}): ${reply.text.slice(0, 200)}`);
  };

  const advanceTo = async (to: number): Promise<void> => {
    isSceneSet = false;
    while (played < cues.length && (cues[played]?.at ?? Number.POSITIVE_INFINITY) <= to) {
      const cue = cues[played];
      played += 1;
      if (cue !== undefined) await dispatch(cue);
    }
    if (to !== minute || played === 0) {
      minute = to;
      await dispatch({ what: `the clock reaches ${timeOf(to)}`, fingerprint: clockSet.fingerprint, context: { id: 'now', day: DAY, minute: Math.min(1439, to) } });
    }
  };

  const enqueue = (work: () => Promise<void>): Promise<void> => {
    queue = queue.then(work).catch((error: unknown) => console.error('[encore/director] a cue failed:', error));
    return queue;
  };

  const pause = (): void => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  };

  const startTimer = (): void => {
    if (timer !== undefined) return;
    timer = setInterval(() => {
      exact += (speed * TICK_MS) / 60_000;
      const whole = Math.floor(exact);
      if (whole > minute) void enqueue(() => advanceTo(whole));
      if (played >= cues.length && whole > (cues.at(-1)?.at ?? 0) + 5) pause();
    }, TICK_MS);
  };

  const undoing = (): Omit<Cue, 'at'>[] => {
    const undo = new Map<string, Omit<Cue, 'at'>>();
    for (const cue of cues) {
      const context = cue.context;
      if (cue.fingerprint === feedSetCount.fingerprint && typeof context['zoneId'] === 'string' && typeof context['hour'] === 'number')
        undo.set(`count:${context['zoneId']}:${context['hour']}`, { what: `${context['zoneId']} back to the start of ${context['hour']}:00`, fingerprint: feedSetCount.fingerprint, context: { ...context, headcount: seededHeadcount(context['zoneId'], DAY, context['hour']) } });
      if (cue.fingerprint === feedOpenIncident.fingerprint) undo.set(`incident:${String(context['id'])}`, { what: `${String(context['id'])} closed`, fingerprint: feedSetIncidentStatus.fingerprint, context: { id: context['id'], status: 'closed' } });
      if (cue.fingerprint === feedSetScanner.fingerprint) undo.set(`gate:${String(context['gateId'])}`, { what: `${String(context['gateId'])} scanners working`, fingerprint: feedSetScanner.fingerprint, context: { gateId: context['gateId'], ok: true } });
    }
    return [...undo.values()];
  };

  const reset = (): Promise<void> =>
    enqueue(async () => {
      for (const cue of undoing()) await dispatch(cue);
      played = 0;
      minute = START_MINUTE;
      exact = START_MINUTE;
      play += 1;
      isSceneSet = true;
      await dispatch({ what: 'the clock goes back to the start', fingerprint: clockSet.fingerprint, context: { id: 'now', day: DAY, minute: START_MINUTE } });
    });

  return {
    // The first play resets too, so that it opens with the same writes as every replay.
    play: () => {
      if (played === 0 && !isSceneSet) void reset().then(startTimer);
      else startTimer();
    },
    reset,
    replay: () => {
      pause();
      void reset().then(startTimer);
    },
    pause,
    faster: () => {
      speed = SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(speed) + 1)] ?? speed;
    },
    slower: () => {
      speed = SPEEDS[Math.max(0, SPEEDS.indexOf(speed) - 1)] ?? speed;
    },
    state: () => {
      const finished = timer === undefined && played >= cues.length;
      return { playing: timer !== undefined, finished, status: finished ? 'finished' : timer !== undefined ? 'playing' : played === 0 ? 'ready' : 'paused', speed, day: DAY, time: timeOf(minute), played, of: cues.length };
    },
    stepTo: (to) => {
      exact = Math.max(exact, to);
      return enqueue(() => advanceTo(to));
    },
    send: (cue) => enqueue(() => dispatch(cue)),
    cues: () => cues,
    close: pause,
  };
};
