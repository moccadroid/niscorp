import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { FunctionDefinition, FunctionSession, MossServer } from '@niscorp/moss';
import type { LayoutNode, Shell } from '@niscorp/nova';
import { questionSendAction } from '@lyceum/app/actions/questions/send.action';
import { BROKEN_FORM, FORM_CHANGED, PREPARED, REQUESTS } from '@lyceum/app/actions/screens/screens';
import { compactJson } from '@lyceum/app/actions/slide/compact';
import { flawsOf, handedFor, layoutModel, screenAgent } from './agent';

// THE Q&A FORM IN THE NOVA TALK (talks/nova.md). The speaker has a model write
// a layout of the form everybody has, and hands Nova a broken one; Moss checks
// each with Nova's audit before it publishes it for everybody. For a request
// the speaker can press, a layout prepared for it goes up when the model has
// not answered in time.
export const DEMO_CANVAS = 'demo';
const MODEL_TIME_MS = 6000;
const DraftSchema = z.looseObject({ draft: z.string() });
const FORM = `action/${questionSendAction.id}`;
const BASE = questionSendAction.layout as LayoutNode;
const REFUSED = 'is refused: ';
const DOCUMENT_GLANCE = 130;
const PARTS = ['data', 'layout', 'triggers', 'endpoints'] as const;

const AskSchema = z.looseObject({ request: z.string().trim().min(1, 'Say how it should look first.') });
const BodySchema = z.looseObject({ ref: z.string() });

const said = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(REFUSED) ? message.slice(message.indexOf(REFUSED) + REFUSED.length) : message;
};
const refOf = (body: unknown): string | undefined => {
  const parsed = BodySchema.safeParse(body);
  return parsed.success ? parsed.data.ref : undefined;
};

// The lines of `code` that are not in `before`, in order: a line that moved is marked too.
const changedLines = (code: string, before: string): number[] => {
  const now = code.split('\n');
  const was = before.split('\n');
  const shared = Array.from({ length: now.length + 1 }, () => new Array<number>(was.length + 1).fill(0));
  for (let i = now.length - 1; i >= 0; i -= 1) {
    for (let j = was.length - 1; j >= 0; j -= 1) {
      const row = shared[i] ?? [];
      row[j] = now[i] === was[j] ? (shared[i + 1]?.[j + 1] ?? 0) + 1 : Math.max(shared[i + 1]?.[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  const marked: number[] = [];
  let i = 0;
  let j = 0;
  while (i < now.length) {
    if (j < was.length && now[i] === was[j]) {
      i += 1;
      j += 1;
    } else if (j < was.length && (shared[i]?.[j + 1] ?? 0) >= (shared[i + 1]?.[j] ?? 0)) j += 1;
    else {
      marked.push(i + 1);
      i += 1;
    }
  }
  return marked;
};

// A layout's keys in one order, so two layouts differ only where they say something different.
const ORDER = ['component', 'ref', 'model', 'for', 'as', 'if', 'then', 'else', 'props', 'children'];
const rank = (key: string): number => (ORDER.includes(key) ? ORDER.indexOf(key) : ORDER.length);
// One child is written as a list of one, as the base layout writes it.
const canonical = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(canonical);
  if (typeof node !== 'object' || node === null) return node;
  const keyed = Object.entries(node).sort(([a], [b]) => rank(a) - rank(b));
  return Object.fromEntries(keyed.map(([key, value]) => [key, canonical(key === 'children' && typeof value === 'object' && value !== null && !Array.isArray(value) ? [value] : value)]));
};
// A layout as a slide shows it: lines short enough to read from the back of the room.
const SLIDE_GLANCE = 80;
const layoutCode = (layout: unknown): string => compactJson(canonical(layout), SLIDE_GLANCE);

// The branches of every `if` closed, as an editor folds them: the layout's shape at a glance.
const FOLD = '\u0000fold';
const folded = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(folded);
  if (typeof node !== 'object' || node === null) return node;
  return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, 'if' in node && (key === 'then' || key === 'else') ? FOLD : folded(value)]));
};
const unfold = (code: string): string => code.replaceAll(JSON.stringify(FOLD), '{ … }');

// Only the changed lines of `code`, each with the line before and after it; a gap between them is one "…" line.
const excerpt = (code: string, before: string): { code: string; marked: number[] } => {
  const lines = code.split('\n');
  const changed = new Set(changedLines(code, before));
  if (changed.size === 0) return { code, marked: [] };
  const shown = lines.map((_, index) => [index, index + 1, index + 2].some((line) => changed.has(line)));
  const out: string[] = [];
  const marked: number[] = [];
  shown.forEach((show, index) => {
    if (!show) {
      if (out.length > 0 && out[out.length - 1] !== '…') out.push('…');
      return;
    }
    out.push(lines[index] ?? '');
    if (changed.has(index + 1)) marked.push(out.length);
  });
  if (out[out.length - 1] === '…') out.pop();
  return { code: out.join('\n'), marked };
};

// The form's whole document as written, and each of its four parts on its own; the layout's branches folded.
const documentOf = (): { code: string; part: Record<(typeof PARTS)[number], string> } => {
  const { data, triggers, endpoints } = questionSendAction;
  const whole = { data, layout: canonical(BASE), triggers, endpoints };
  const shown = { ...whole, layout: folded(whole.layout) };
  const part = Object.fromEntries(PARTS.map((key) => [key, unfold(compactJson({ [key]: shown[key] }, SLIDE_GLANCE))])) as Record<(typeof PARTS)[number], string>;
  return { code: compactJson(whole, DOCUMENT_GLANCE), part };
};
const DOCUMENT = documentOf();

// The components a layout names.
const componentsOf = (layout: unknown): string[] => {
  const names = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (typeof node === 'object' && node !== null) {
      if ('component' in node && typeof node.component === 'string') names.add(node.component);
      Object.values(node).forEach(walk);
    }
  };
  walk(layout);
  return [...names];
};

// A function as it is written in this app's source: from its `export const` line to the `};` that closes it.
const sourceOf = (file: string, name: string): string => {
  const lines = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8').split('\n');
  const start = lines.findIndex((line) => line.startsWith(`export const ${name}`));
  const end = lines.findIndex((line, index) => index > start && line === '};');
  return start < 0 || end < 0 ? '' : lines.slice(start, end + 1).join('\n');
};
const BUTTON_SOURCE = sourceOf('../../ui/kit.ts', 'Action');
const BROKEN = excerpt(layoutCode(BROKEN_FORM), layoutCode(BASE));

// The form on the projector as a model reads it, the way a phone's X-ray opens it: its data, then the document it runs.
const readOf = (shell: Shell): { data: string; rest: string } => {
  const instance = (shell.getState().canvases[DEMO_CANVAS]?.stack ?? []).find((one) => one.definitionId === questionSendAction.id);
  const runtime = instance === undefined ? undefined : shell.getRuntime(instance.id);
  if (runtime === undefined) return { data: '', rest: '' };
  const { data: _written, layout, ...rest } = runtime.definition;
  return { data: compactJson({ data: runtime.getData() }, SLIDE_GLANCE), rest: unfold(compactJson({ ...rest, layout: folded(canonical(layout)) }, DOCUMENT_GLANCE)) };
};

type How = '' | 'model' | 'prepared';
type Last = { request: string; how: How; attempts: number; writing: boolean; said: string };
const NOTHING_ASKED: Last = { request: '', how: '', attempts: 0, writing: false, said: '' };

export type Screens = {
  functions: (session: FunctionSession) => FunctionDefinition[];
  reset: () => Promise<void>;
};

export const createScreens = (server: () => MossServer, env: Record<string, string | undefined> = process.env): Screens => {
  const model = layoutModel(env);
  let inForce: LayoutNode = BASE;
  let before: LayoutNode = BASE;
  let broken = '';
  let last: Last = NOTHING_ASKED;
  let stage: Shell | undefined;
  const followed = new WeakSet<Shell>();

  const tell = (): void => {
    const host = server().shells;
    for (const principal of new Set((host?.list() ?? []).map((shell) => shell.principal))) if (principal !== null) host?.deliver(principal, FORM_CHANGED);
  };

  // A layout of the form for everybody who has it, or what Moss refused it with.
  const publish = async (layout: LayoutNode): Promise<string | undefined> => {
    const held = (await server().defaults('stage').list('layout')).find((saved) => refOf(saved.body) === FORM);
    try {
      await server().defaults('stage').save([{ kind: 'layout', ...(held === undefined ? {} : { id: held.id }), body: { ref: FORM, layout, use: true } }]);
    } catch (error) {
      return said(error);
    }
    before = inForce;
    inForce = layout;
    return undefined;
  };
  const putBack = async (): Promise<void> => {
    for (const saved of await server().defaults('stage').list('layout')) if (refOf(saved.body) === FORM) await server().defaults('stage').reset('layout', saved.id);
    before = BASE;
    inForce = BASE;
  };

  const onlySpeaker = (session: FunctionSession): void => {
    if (session.principal !== 'speaker') throw new Error('Only the speaker changes the form.');
  };

  return {
    reset: async () => {
      await putBack();
      broken = '';
      last = NOTHING_ASKED;
      tell();
    },

    functions: (session) => [
      {
        id: 'form.state',
        description: 'Answers what the speaker can ask the model for with one press, and what the last layout took. Send nothing.',
        execute: async () => ({ rows: REQUESTS.map((request) => ({ request })), ...last }),
      },
      {
        id: 'form.layout',
        description: 'Has Nova’s layout agent write a layout of the Q&A form as the speaker says, and publishes it for everybody once Moss takes it. The speaker only. Send { request }; answers { took, attempts }.',
        execute: async (input) => {
          onlySpeaker(session);
          const { request } = AskSchema.parse(input);
          last = { ...NOTHING_ASKED, request, writing: true };
          tell();
          const finish = (next: Omit<Last, 'request' | 'writing'>): void => {
            last = { request, writing: false, ...next };
            tell();
          };
          const prepared = PREPARED[request];
          // Whichever layout goes up first is the one: the model's, or the prepared one when the model is late or fails.
          let taken = '' as How;
          let attempts = 0;
          const putUpPrepared = async (): Promise<void> => {
            if (taken !== '' || prepared === undefined) return;
            taken = 'prepared';
            const refused = await publish(prepared);
            finish(refused === undefined ? { how: 'prepared', attempts, said: '' } : { how: '', attempts, said: refused });
          };
          if (model === undefined) {
            if (prepared !== undefined) await putUpPrepared();
            else finish({ how: '', attempts: 0, said: 'the model can’t be reached: there is no GROQ_API_KEY here.' });
            return { how: last.how };
          }
          let lastRefusal = '';
          const start = inForce;
          const refuse = (why: string): string => {
            lastRefusal = why;
            return why;
          };
          const agent = screenAgent('form', async (layout) => {
            if (taken !== '') return undefined;
            if (JSON.stringify(layout) === JSON.stringify(start)) return refuse('the layout is the one it started from; change it as asked.');
            const flaws = flawsOf(start, layout);
            if (flaws !== undefined) return refuse(flaws);
            taken = 'model';
            const refused = await publish(layout);
            if (refused === undefined) return undefined;
            taken = '';
            return refuse(refused);
          });
          const late = prepared === undefined ? undefined : setTimeout(() => void putUpPrepared(), MODEL_TIME_MS);
          try {
            const result = await agent.run({ ...handedFor(questionSendAction, start, request) }, { llm: model, onEvent: (event) => void (event.type === 'retry' ? (attempts += 1) : undefined) }).result;
            if (taken === 'model') finish({ how: 'model', attempts: attempts + 1, said: '' });
            else if (prepared !== undefined) await putUpPrepared();
            else if (!result.ok) finish({ how: '', attempts: attempts + 1, said: lastRefusal === '' ? said(result.error.message) : `three tries were refused; the last because ${lastRefusal}` });
          } catch (error) {
            if (prepared !== undefined) await putUpPrepared();
            else finish({ how: '', attempts: attempts + 1, said: said(error) });
          } finally {
            clearTimeout(late);
          }
          return { how: last.how };
        },
      },
      {
        id: 'form.type',
        description: 'Types into the Q&A form on the projector, as the speaker types. The speaker only. Send { draft }.',
        execute: async (input) => {
          onlySpeaker(session);
          const { draft } = DraftSchema.parse(input);
          const instance = (stage?.getState().canvases[DEMO_CANVAS]?.stack ?? []).find((one) => one.definitionId === questionSendAction.id);
          const runtime = instance === undefined ? undefined : stage?.getRuntime(instance.id);
          if (runtime === undefined) throw new Error('The form is not on the projector now.');
          runtime.setData({ ...runtime.getData(), draft });
          return 'Typed.';
        },
      },
      {
        id: 'form.broken',
        description: 'Hands Nova a layout of the Q&A form with two mistakes in it; Moss runs Nova’s audit and refuses it, and what it said is kept. The speaker only. Send nothing.',
        execute: async () => {
          onlySpeaker(session);
          const refused = await publish(BROKEN_FORM);
          broken = refused ?? '';
          tell();
          return refused === undefined ? 'It was taken.' : 'Refused. Nobody’s form changed.';
        },
      },
      {
        id: 'form.put-back',
        description: 'Puts the Q&A form back as it was written, for everybody. The speaker only. Send nothing.',
        execute: async () => {
          onlySpeaker(session);
          await putBack();
          broken = '';
          last = NOTHING_ASKED;
          tell();
          return 'The form is as it was.';
        },
      },
      {
        id: 'room.form',
        description: 'Answers what the Nova slides show of the Q&A form: its document part by part, the model’s last layout with what changed, the broken layout and what refused it, how a terminal and a program see it, and the kit. The stage only. Send nothing.',
        execute: async () => {
          if (session.principal !== 'stage') throw new Error('Only the stage reads the form.');
          const shell = session.shell;
          stage = shell;
          // The form on the projector is drawn again as it changes: the slides read again, so what they say of it follows.
          if (!followed.has(shell)) {
            followed.add(shell);
            shell.onDataChange((changed) => {
              if (changed.canvasId === DEMO_CANVAS) server().shells?.deliver('stage', FORM_CHANGED);
            });
          }
          return {
            document: DOCUMENT,
            layout: excerpt(layoutCode(inForce), layoutCode(before)),
            last,
            broken: { ...BROKEN, said: broken },
            read: readOf(shell),
            kit: { names: componentsOf(inForce).join(' · '), button: BUTTON_SOURCE },
          };
        },
      },
    ],
  };
};
