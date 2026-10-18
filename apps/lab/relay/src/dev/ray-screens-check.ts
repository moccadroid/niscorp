import type { ActionDefinition } from '@niscorp/nova';
import type { ToolContext } from '@niscorp/cortex';
import { makeScreenTools, placeScreen } from '@relay/server/functions/ray/architect';
import type { RayContext } from '@relay/server/functions/ray';

// The screen tools against a session double, with no model: what a built
// screen does to the draft, the shell and the session's list of screens.
type Added = Parameters<RayContext['draft']['add']>[0];

const main = async (): Promise<void> => {
  const checks: [string, boolean][] = [];
  const adds: Added[] = [];
  const pushed: string[] = [];
  const calls: string[] = [];
  let minted = 0;
  let drafted: { kind: 'action' | 'read' | 'layout' | 'fragment'; id: string; body: unknown }[] = [];
  const saved: { kind: 'action'; id: string; body: unknown }[] = [{ kind: 'action', id: 'generated.kept-earlier', body: { name: 'Kept earlier', layout: { component: 'Text', children: 'kept' } } }];

  const ray = {
    get shell() {
      return { push: (canvas: string, id: string) => (pushed.push(`${canvas}:${id}`), 'inst') } as unknown as RayContext['shell'];
    },
    userId: 'usr_001',
    wire: async () => ({ ok: true, status: 200, json: async () => [], text: async () => '[]' }),
    answerIntent: async () => Promise.reject(new Error('no intent is asked here')),
    draft: {
      add: async (artifacts: Added) => {
        // As moss checks an add: against the draft as it stood before it.
        for (const artifact of artifacts) {
          if (artifact.kind !== 'action') continue;
          const replayed = [...JSON.stringify(artifact.body).matchAll(/"(fp_[0-9a-f]{16})"/g)].map((m) => m[1] ?? '');
          const unknown = replayed.find((fingerprint) => !drafted.some((held) => held.kind === 'read' && held.id === fingerprint));
          if (unknown !== undefined) throw new Error(`moss: the action is refused: endpoint "load" replays "${unknown}", which is no entry the app ships or was handed, nor a read its owner saved`);
        }
        adds.push(artifacts);
        const answered = artifacts.map((artifact) => ({ kind: artifact.kind, id: artifact.id ?? (artifact.kind === 'action' ? `generated.${(minted += 1)}` : artifact.kind) }));
        drafted = [...drafted, ...artifacts.map((artifact, at) => ({ kind: artifact.kind, id: answered[at]?.id ?? '', body: artifact.body }))];
        return { step: adds.length, artifacts: answered };
      },
      list: () => drafted,
      remove: async () => ({ step: 0 }),
      show: async () => undefined,
      discard: async () => {
        calls.push('discard');
        drafted = [];
      },
      save: async () => {
        calls.push('save');
        const kept = drafted.filter((artifact) => artifact.kind === 'action');
        return { save: 's1', artifacts: kept.map(({ kind, id }) => ({ kind, id })) };
      },
    },
    artifacts: {
      save: async () => Promise.reject(new Error('not here')),
      list: async () => saved.map((version) => ({ ...version, save: 's0', createdAt: '', copiedFrom: null })),
      history: async () => [],
      restore: async () => Promise.reject(new Error('not here')),
      reset: async () => Promise.reject(new Error('not here')),
    },
  } as unknown as RayContext;

  const built: ActionDefinition = {
    id: 'top-deals',
    name: 'Top deals',
    data: { rows: [] },
    endpoints: { load: { url: '/api/vex', method: 'POST', request: { fingerprint: 'fp_0123456789abcdef' }, target: 'rows' } },
    lifecycle: { mount: [{ call: 'load' }] },
    layout: { component: 'Text', children: 'deals' },
  };

  const id = await placeScreen(ray, built, undefined, true);
  checks.push([`a new screen's reads are added first, then the screen without an id, in two adds (got ${JSON.stringify(adds.map((one) => one.map((a) => [a.kind, a.id ?? '-'])))})`,
    adds.length === 2 && adds[0]?.length === 1 && adds[0][0]?.kind === 'read' && adds[0][0]?.id === 'fp_0123456789abcdef' && adds[0][0]?.body === undefined && adds[1]?.length === 1 && adds[1][0]?.kind === 'action' && adds[1][0]?.id === undefined && !('id' in (adds[1][0]?.body as object))]);
  checks.push([`the id moss gave is what is pushed on main (got ${pushed.join(',')})`, id === 'generated.1' && pushed.join(',') === 'main:generated.1']);

  const edited = await placeScreen(ray, { ...built, id, name: 'Top deals, edited' }, id, false);
  checks.push([`an edit is added under the same id and is not placed when it failed review (got ${edited}, pushed ${pushed.length})`, edited === id && adds[3]?.[0]?.id === id && pushed.length === 1]);

  const tools = makeScreenTools(ray);
  await new Promise((r) => setTimeout(r, 0));
  checks.push([`the screens kept earlier are in the session's list (got ${tools.entries().map((e) => e.id).join(',')})`, tools.has('generated.kept-earlier') && tools.entries()[0]?.description === 'Kept earlier']);

  const ctx: ToolContext = { runId: 'check', agentId: 'ray', agentPath: ['ray'], signal: new AbortController().signal, forward: () => undefined };
  const keptSaid = await tools.keep.config.execute({}, ctx);
  checks.push([`keep_screens saves the draft and names what it kept (got ${String(keptSaid)})`, calls.includes('save') && String(keptSaid).includes('generated.1')]);

  const discardSaid = await tools.discard.config.execute({}, ctx);
  checks.push([`discard_screens throws the draft away and names it (got ${String(discardSaid)})`, calls.includes('discard') && String(discardSaid).includes('generated.1') && drafted.length === 0]);

  let ok = true;
  for (const [label, pass] of checks) {
    ok = ok && pass;
    console.log(`${pass ? '✓' : '✗'} ${label}`);
  }
  console.log(ok ? '\nOK — a built screen goes into the draft with its reads, is placed by the id moss gave it, and is kept or discarded by the tools (no LLM).' : '\nFAIL.');
  process.exit(ok ? 0 : 1);
};
void main();
