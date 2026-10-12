import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { OPERATOR_PRINCIPAL } from '@encore/app/charter/assignments';
import { ENTRIES } from '@encore/app/vex';
import { encoreAgent } from '@encore/server/agent/agent';
import { createReadTools } from '@encore/server/agent/tools';
import type { AgentScript, FakeAgentControls } from '@encore/server/agent/fake-llm';
import { STORM_PLAN_STEPS, createReporter, createWorld, mounted, planOf, settle } from './world-factory';

const AGENT_DIR = join(import.meta.dirname, '..', 'server', 'agent');

const { check, report } = createReporter();

const FORBIDDEN: readonly { what: string; pattern: RegExp }[] = [
  { what: 'dispatches an event', pattern: /\.dispatch\s*\(/ },
  { what: 'publishes on a channel', pattern: /\.publish\s*\(/ },
  { what: 'writes a card’s data', pattern: /\.setData\s*\(/ },
  { what: 'reaches a runtime', pattern: /getRuntime\s*\(/ },
  { what: 'reconciles a canvas', pattern: /reconcileCanvas/ },
  { what: 'pushes, replaces or clears a canvas', pattern: /\bshell\s*\.\s*(push|replace|clear|pop|removeInstance)\b/ },
  { what: 'holds a shell', pattern: /\bsession\s*\.\s*shell\b|:\s*Shell\b|\bShell\s*[,}]/ },
  { what: 'calls fetch directly', pattern: /\bfetch\s*\(/ },
  { what: 'calls an action’s endpoint', pattern: /\bendpoints?\s*[.[(]|runEndpoint|\.call\s*\(\s*['"]/ },
];

const withoutComments = (source: string): string =>
  source
    .split('\n')
    .map((line) => line.replace(/^\s*\/\/.*$/, '').replace(/\s\/\/ .*$/, ''))
    .join('\n');

const main = async (): Promise<void> => {
  const names = (await readdir(AGENT_DIR)).filter((name) => name.endsWith('.ts')).sort();
  const files = await Promise.all(names.map(async (name) => ({ name, code: withoutComments(await readFile(join(AGENT_DIR, name), 'utf8')) })));
  check(`the agent is ${files.length} files under src/server/agent/ (${names.join(', ')})`, files.length >= 6 && names.includes('agent.ts') && names.includes('tools.ts') && names.includes('run.ts'));

  for (const rule of FORBIDDEN) {
    const offenders = files.filter((file) => rule.pattern.test(file.code)).map((file) => file.name);
    check(`no file under agent/ ${rule.what}${offenders.length === 0 ? '' : ` — BUT ${offenders.join(', ')} does`}`, offenders.length === 0);
  }

  const mutations = ENTRIES.flatMap((entry) => ('mutation' in entry ? [entry.fingerprint] : []));
  const namingAWrite = files.filter((file) => mutations.some((fingerprint) => file.code.includes(`'${fingerprint}'`) || file.code.includes(`"${fingerprint}"`))).map((file) => file.name);
  check(`no file under agent/ names a mutation’s fingerprint (${mutations.join(', ')})`, mutations.length >= 4 && namingAWrite.length === 0);

  const wireCalls = files.map((file) => ({ name: file.name, calls: file.code.match(/\bwire\s*\(/g)?.length ?? 0 })).filter((file) => file.calls > 0);
  check('exactly ONE request is made from agent/: the replay in tools.ts, to /api/vex', wireCalls.length === 1 && wireCalls[0]?.name === 'tools.ts' && wireCalls[0]?.calls === 1 && files.every((file) => (file.code.match(/['"`]\/api\/[^'"`]*['"`]/g) ?? []).every((url) => url.slice(1, -1) === '/api/vex')));
  const novaImports = files.flatMap((file) => (file.code.match(/^import .*from '@niscorp\/nova';$/gm) ?? []).map((line) => ({ name: file.name, line })));
  check(`nothing but TYPES is imported from nova (${novaImports.length} import${novaImports.length === 1 ? '' : 's'})`, novaImports.every((entry) => entry.line.startsWith('import type ')));
  check('...and the refusal in tools.ts comes BEFORE its one request', ((): boolean => { const code = files.find((file) => file.name === 'tools.ts')?.code ?? ''; const refusedAt = code.indexOf('writes.has(fingerprint)'); const allowedAt = code.indexOf('!allowed.has(fingerprint)'); const wireAt = code.search(/\bwire\s*\(/); return refusedAt > 0 && allowedAt > refusedAt && wireAt > allowedAt; })());
  check('no file under agent/ can type into the line, start a pass or start a run', !files.some((file) => ["'line-type'", 'encore.intent', 'encore.run', 'runNow', '.submit('].some((word) => file.code.includes(word))));
  check('the agent is defined ONCE, at module scope, with no tools of its own: they arrive on the run', (files.find((file) => file.name === 'agent.ts')?.code.match(/defineAgent\s*[<(]/g)?.length ?? 0) === 1 && files.filter((file) => /defineAgent\s*[<(]/.test(file.code)).length === 1 && (encoreAgent.config.tools ?? []).length === 0);
  check('...its output strategy is left to signal, and `response` is not forced', encoreAgent.config.output?.strategy === undefined && encoreAgent.config.output?.response === undefined);

  const WATCH_DIR = join(import.meta.dirname, '..', 'server', 'watch');
  const watchNames = (await readdir(WATCH_DIR)).filter((name) => name.endsWith('.ts')).sort();
  const watchFiles = await Promise.all(watchNames.map(async (name) => ({ name, code: withoutComments(await readFile(join(WATCH_DIR, name), 'utf8')) })));
  const mutationExports = ['labelAdd', 'feedSetCount', 'feedOpenIncident', 'feedSetIncidentStatus', 'feedSetScanner', 'feedScan', 'clockSet', 'slotSwap', 'delayAdd', 'pushSend', 'threadAppend'];
  check(`the event path is ${watchFiles.length} files under src/server/watch/ (${watchNames.join(', ')})`, watchNames.includes('watch.ts') && watchNames.includes('events.ts') && watchNames.includes('ceiling.ts'));
  check('no file under watch/ names a mutation — by fingerprint or by import — so an event pass CANNOT write: not a label, not a push, not a gate', !watchFiles.some((file) => mutations.some((fingerprint) => file.code.includes(`'${fingerprint}'`)) || mutationExports.some((name) => new RegExp(`\\b${name}\\b`).test(file.code))));
  check('...nor dispatches an event, calls fetch, or reaches the director', !watchFiles.some((file) => /\.dispatch\s*\(/.test(file.code) || /\bfetch\s*\(/.test(file.code) || file.code.includes('director/director')));
  check('...and every request it makes is a replay to /api/vex', watchFiles.every((file) => (file.code.match(/['"`]\/api\/[^'"`]*['"`]/g) ?? []).every((url) => url.slice(1, -1) === '/api/vex')));

  const controls: FakeAgentControls = { latencyMs: 0, chunkMs: 0, seen: [] };
  const world = await createWorld({ agent: { kind: 'fake', fake: controls } });
  const OP = OPERATOR_PRINCIPAL;
  const shell = await world.login(OP);
  await settle();
  const before = await world.tableCounts();
  const headlinerStage = async (): Promise<unknown> => (await world.sql(`SELECT s.stage_id FROM slots s JOIN acts a ON a.id = s.act_id WHERE a.billing = 'headliner'`))[0]?.['stage_id'];
  const stageBefore = await headlinerStage();

  for (const sentence of ["what's going on?", 'is the tent free then?', 'warn everyone about the storm at 9']) {
    await world.typeLine(OP, sentence);
    await world.settled(OP);
  }
  controls.script = planOf(STORM_PLAN_STEPS);
  await world.typeLine(OP, 'storm at 9 what should we do with the headliner');
  await world.settled(OP);
  controls.script = undefined;
  const ran = world.runsOf(OP).map((run) => run.status);
  check(`the assistant ran on every finished sentence (${ran.join(', ')}), wrote words into a form and proposed a plan`, ran.length >= 4 && ran.every((status) => status === 'landed') && world.runsOf(OP).some((run) => run.fieldsWritten.length > 0) && world.runsOf(OP).some((run) => run.planSteps > 0));
  check(`...and a plan opened NOTHING: its forms wait for a person (doing: ${mounted(shell, 'doing').join(', ') || 'empty'})`, !mounted(shell, 'doing').includes('slot.swap'));

  // A run is capped at six model steps, so the scripted run asks for the five
  // writes a person can make; every mutation there is, the feed's included, is
  // put to the tool directly below.
  const attempts = mutations.filter((fingerprint) => ['slots/swap', 'delays/add', 'pushes/send', 'agent/appendTurn', 'attention/label'].includes(fingerprint));
  const misbehave: AgentScript = (turn) => {
    const next = attempts[turn.lookups.length];
    return next === undefined
      ? { answer: { response: `I tried ${turn.lookups.length} writes and was refused every time.`, data: {} } }
      : { call: { name: 'query', args: { fingerprint: next, context: { actId: 'act_nova_kestrel', toStageId: 'stage_tent', minutes: 30, audience: 'everyone', urgency: 2, body: 'x', role: 'agent', detail: '{}' } } } };
  };
  controls.script = misbehave;
  controls.seen.length = 0;
  await world.typeLine(OP, '');
  await world.typeLine(OP, 'is anything wrong at the moment?');
  await world.settled(OP);
  controls.script = undefined;
  const rogue = world.runsOf(OP).at(-1);
  check(`a run SCRIPTED to write asked for every write a person can make (${rogue?.lookups.length} of ${attempts.length}) and was refused each time: ${rogue?.lookups.join(' · ')}`, rogue?.status === 'landed' && rogue.lookups.length === attempts.length && attempts.length === 5 && rogue.lookups.every((line) => line.endsWith('→ refused')));
  check('...the refusal was the tool’s ANSWER — the model read it and carried on', controls.seen.at(-1)?.messages.filter((message) => message.role === 'tool' && message.content.includes('changes data')).length === attempts.length);
  const lawSession = world.booted.intent.sessionOf(OP);
  if (lawSession === undefined) throw new Error('law-check: no session');
  let requestsMade = 0;
  const lawTools = createReadTools({ wire: (url, init) => { requestsMade += 1; return lawSession.wire(url, init); }, policy: world.booted.server.policyForRoles(lawSession.roles), entries: ENTRIES });
  const queryTool = lawTools.find((tool) => tool.config.name === 'query');
  const verdicts = await Promise.all(mutations.map(async (fingerprint) => JSON.stringify(await queryTool?.config.execute({ fingerprint, context: {} }, { runId: 'law', agentId: 'law', agentPath: ['law'], signal: new AbortController().signal, forward: () => {} }))));
  check(`the read tool refuses ALL ${mutations.length} mutations — the feed’s included — before the wire (${requestsMade} requests made)`, mutations.length === 11 && verdicts.every((verdict) => verdict.includes('"refused"') && verdict.includes('changes data')) && requestsMade === 0);
  check('...and the headliner is where she was', (await headlinerStage()) === stageBefore && stageBefore !== undefined);

  const after = await world.tableCounts();
  const grew = Object.keys(after).filter((table) => after[table] !== before[table]);
  check(`NO RUN WROTE A ROW other than its own thread (${world.runsOf(OP).length} runs, ${Object.keys(after).length} tables counted; changed: ${grew.join(', ')})`, grew.join() === 'agent_turns' && (after['agent_turns'] ?? 0) > (before['agent_turns'] ?? 0));
  check('...and even that was not the agent’s doing: the loop stores turns, the engine stamps them, and no file under agent/ knows the table exists', (await world.sql('SELECT DISTINCT principal FROM agent_turns')).map((row) => row['principal']).join() === OP && !files.some((file) => file.code.includes('agent_turns') || file.code.includes('thread.entries') || file.code.includes('intent/thread')));

  await world.typeLine(OP, '');
  await world.settled(OP);
  const beforeEvening = await world.tableCounts();
  await world.booted.director.stepTo(18 * 60 + 25);
  await settle(8);
  await world.settled(OP);
  const watched = world.booted.intent.of(OP)?.watching().stats();
  const afterEvening = await world.tableCounts();
  const grewWatching = Object.keys(afterEvening).filter((table) => afterEvening[table] !== beforeEvening[table]).sort();
  check(`AN EVENT PASS PLACES CARDS AND WRITES NOTHING: ${watched?.passes} passes, ${watched?.raised} raised, ${watched?.briefs} brief — and the only tables that grew are the feed’s own writes and the thread (${grewWatching.join(', ')})`, (watched?.raised ?? 0) >= 2 && (watched?.briefs ?? 0) === 1 && grewWatching.join() === 'agent_turns,gate_scans,incidents');
  check('...no label without a click, no push, no hold, and every gate as the FEED left it', afterEvening['attention_labels'] === 0 && afterEvening['pushes'] === beforeEvening['pushes'] && afterEvening['delays'] === beforeEvening['delays'] && (await headlinerStage()) === stageBefore);

  await report('law-check', [world]);
};

void main();
