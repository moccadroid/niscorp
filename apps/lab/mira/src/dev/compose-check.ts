import { renderDocument } from '@niscorp/moss';
import type { z } from 'zod';
import { ANSWERS } from '../app/answers';
import { boot } from '../server/boot';
import type { Decide, Fill, Models } from '../server/compose';
import { drawing } from '../server/document';

// Offline, and the same every run: a decision model that says yes to the prepared answers each message is scripted
// to reach, and picks a value the message names; a chat model that answers a scripted reply.
const REACHES: Record<string, string[]> = {
  'Show me every greeting': ['greetings.table'],
  'How many greetings are there?': ['greetings.count'],
  'Greetings per language': ['greetings.per-language'],
  'Which greetings are in German?': ['greetings.in-language'],
  'Add a greeting that says Servus': ['greetings.add'],
  'Everything about the greetings': ['greetings.count', 'greetings.per-language', 'greetings.table'],
};
const REPLIES: Record<string, unknown> = {
  'Add a greeting that says Servus': { answers: [{ id: 'greetings.add', set: { 'fields.0.value': 'Servus', 'fields.1.value': 'German' } }] },
  'how many are there': { answers: [{ id: 'greetings.count' }] },
};

const decide: Decide = async (state, questions) =>
  Object.fromEntries(
    Object.entries(questions).map(([name, question]) => {
      const message = String(state['message']);
      if (question.type === 'noul') {
        const answer = ANSWERS.find((candidate) => question.instructions.includes(candidate.shows));
        return [name, { yes: answer !== undefined && (REACHES[message] ?? []).includes(answer.id), p: 0.9 }];
      }
      const named = Object.entries(question.criteria).find(([key, value]) => key !== 'none' && message.toLowerCase().includes(value.toLowerCase()));
      return [name, { choice: named?.[0] ?? 'none', p: 0.9 }];
    }),
  );

const fill: Fill = async <T>(_system: string, user: string, schema: z.ZodType<T>): Promise<T> => {
  const message = /^Message: (.*)$/m.exec(user)?.[1] ?? '';
  return schema.parse(REPLIES[message] ?? { answers: [] });
};

let failures = 0;
const check = (name: string, passed: boolean, detail = ''): void => {
  console.log(`${passed ? '[pass]' : '[fail]'} ${name}${!passed && detail !== '' ? ` — ${detail}` : ''}`);
  if (!passed) failures += 1;
};

const until = async (condition: () => boolean, ms = 5000): Promise<boolean> => {
  const deadline = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > deadline) return false;
    await new Promise((done) => setTimeout(done, 10));
  }
  return true;
};

const models: Models = { decide, fill, missing: [] };
const { server } = await boot(models);
try {
  const shells = server.shells;
  if (shells === undefined) throw new Error('the manifest has no shell');

  const template = '<!doctype html><html><head></head><body><div id="root"></div></body></html>';
  const page = await renderDocument({ ...drawing, server, template, request: { path: '/', cookie: null } });
  check('the page arrives drawn: the frame, the welcome, the line to ask in', page.drawn && page.html.includes('k-frame') && page.html.includes('k-prompt') && page.html.includes('Show me every greeting'), page.html.slice(0, 300));

  const session = await shells.session(null, null);
  const shell = session.shell;
  const on = (canvas: string): { action: string; data: Record<string, unknown> } => {
    const active = shell.getState().canvases[canvas]?.active;
    return { action: active?.definitionId ?? '', data: active === undefined ? {} : (shell.getRuntime(active.id)?.getData() ?? {}) };
  };
  // What a terminal does whenever the screen changes: draw every action on it. An input takes what is typed into it
  // once it has been drawn.
  const draw = (): void => void shell.flattenRenderTree(shell.getShellRenderTree());
  const ask = async (text: string): Promise<void> => {
    draw();
    session.dispatch('line', { type: 'ui:model', ref: 'text', payload: text });
    session.dispatch('line', { type: 'ui:key', ref: 'text', key: 'Enter' });
    await until(() => on('bar').data['current'] !== undefined && (on('bar').data['current'] as { question?: string }).question === text && on('line').data['asking'] === false);
  };
  const rows = (canvas: string, key: string): unknown[] => {
    const value = on(canvas).data[key];
    return Array.isArray(value) ? value : [];
  };

  check('before anything is asked: the bar, the welcome on the first area, the line', on('bar').action === 'answer.bar' && on('a').action === 'answer.home' && on('line').action === 'ask.line');

  await ask('Show me every greeting');
  check('"Show me every greeting" is a table on the first area, and nothing on the others', on('a').action === 'rows.table' && on('b').action === '', `${on('a').action} / ${on('b').action}`);
  check('the table reads the five hello-worlds', await until(() => rows('a', 'rows').length === 5), JSON.stringify(on('a').data['rows']));

  await ask('How many greetings are there?');
  check('"How many greetings are there?" is one number: 5', await until(() => on('a').action === 'rows.stat' && (on('a').data['result'] as { value?: unknown } | undefined)?.value === 5), JSON.stringify(on('a').data));

  await ask('Greetings per language');
  check('"Greetings per language" is bars, one for each of the five languages', await until(() => on('a').action === 'rows.bars' && rows('a', 'items').length === 5), JSON.stringify(on('a').data['items']));

  await ask('Which greetings are in German?');
  check('"Which greetings are in German?" reads the greetings in German alone', await until(() => on('a').action === 'rows.table' && rows('a', 'rows').length === 1), JSON.stringify(on('a').data['params']));

  await ask('Everything about the greetings');
  check('a message three answers fit fills three areas, in the order they were picked', on('a').action !== '' && on('b').action !== '' && on('c').action !== '' && on('d').action === '', ['a', 'b', 'c', 'd'].map((c) => on(c).action).join(' / '));

  await ask('Add a greeting that says Servus');
  check('"Add a greeting that says Servus" opens the form', on('a').action === 'rows.form');
  const fields = (): { key: string; value: string }[] => rows('a', 'fields') as { key: string; value: string }[];
  check('the model fills it in, and the filled-in form replaces the empty one', await until(() => fields()[0]?.value === 'Servus' && fields()[1]?.value === 'German'), JSON.stringify(fields()));
  session.dispatch('a', { type: 'ui:click', ref: 'save' });
  check('the person saves it', await until(() => on('a').data['saved'] === true), String(on('a').data['error']));

  await ask('How many greetings are there?');
  check('the count read again counts it: 6', await until(() => (on('a').data['result'] as { value?: unknown } | undefined)?.value === 6), JSON.stringify(on('a').data['result']));

  await ask('What is the weather in Vienna?');
  check('a message nothing answers is a notice, with things to ask instead', on('a').action === 'answer.notice' && rows('a', 'examples').length === ANSWERS.length);

  const position = (): number => Number((on('bar').data['current'] as { position?: unknown } | undefined)?.position);
  const weather = position();
  await ask('how many are there');
  check('a message the picker is sure of nothing about, and the model answers, is the model’s answer — one answer, no notice before it', on('a').action === 'rows.stat' && position() === weather + 1, `${on('a').action}, position ${position()} after ${weather}`);

  session.dispatch('bar', { type: 'ui:click', ref: 'back' });
  check('back is the answer before: the notice', await until(() => position() === weather && on('a').action === 'answer.notice'), `position ${position()}, ${on('a').action}`);
  session.dispatch('bar', { type: 'ui:click', ref: 'forward' });
  check('forward is the count again', await until(() => position() === weather + 1 && on('a').action === 'rows.stat'), `position ${position()}, ${on('a').action}`);
} finally {
  server.close();
}

const { server: keyless } = await boot({ missing: ['GROQ_API_KEY'] });
try {
  const shells = keyless.shells;
  if (shells === undefined) throw new Error('the manifest has no shell');
  const session = await shells.session(null, null);
  session.shell.flattenRenderTree(session.shell.getShellRenderTree());
  session.dispatch('line', { type: 'ui:model', ref: 'text', payload: 'Show me every greeting' });
  session.dispatch('line', { type: 'ui:key', ref: 'text', key: 'Enter' });
  const first = (): string => session.shell.getState().canvases['a']?.active?.definitionId ?? '';
  check('with no key, a message is answered with a notice naming the key', await until(() => first() === 'answer.notice'), first());
} finally {
  keyless.close();
}

console.log(failures === 0 ? '[pass] compose: all checks passed' : `[fail] compose: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
