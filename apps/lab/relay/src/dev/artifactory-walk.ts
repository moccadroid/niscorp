import type { Shell } from '@niscorp/nova';
import { login } from './check-shell';
import { assign } from '@relay/server/llm';

// The screen builder through the real session and its artifactory, as a person drives it: the assistant's own
// input and send button, the canvas it places on, and a fresh session for the same person standing in for a reload.
assign('architect', 'groq-120b');
assign('chat', 'groq-120b');

type Node = { type?: string; name?: string; props?: Record<string, unknown>; children?: Node[] };
const nodes = (list: Node[]): Node[] => list.flatMap((node) => [node, ...nodes(node.children ?? [])]);
const settle = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const assistantOf = (shell: Shell) => {
  const instance = shell.getCanvasState('modal').stack.find((one) => one.definitionId === 'assistant');
  return instance === undefined ? undefined : shell.getRuntime(instance.id);
};

type Said = { text: string; tools: string[]; seconds: number };

const ask = async (shell: Shell, text: string): Promise<Said> => {
  if (assistantOf(shell) === undefined) {
    shell.push('modal', 'assistant');
    await settle(1500);
  }
  const runtime = assistantOf(shell);
  if (runtime === undefined) throw new Error('the assistant did not open');
  const before = (runtime.getData()['messages'] as unknown[]).length;
  const t0 = Date.now();
  shell.dispatch({ type: 'ui:model', ref: 'ray-draft', payload: text });
  await settle(100);
  shell.dispatch({ type: 'ui:click', ref: 'ray-send' });
  for (let waited = 0; waited < 12 * 60; waited += 1) {
    await settle(1000);
    const data = runtime.getData();
    const messages = data['messages'] as { role: string; text: string; trace?: { tool: string }[] }[];
    if (data['status'] === 'idle' && messages.length >= before + 2) {
      const reply = messages[messages.length - 1];
      return { text: reply?.text ?? '', tools: (reply?.trace ?? []).map((step) => step.tool), seconds: Math.round((Date.now() - t0) / 1000) };
    }
  }
  throw new Error(`no reply to "${text}" within 12 minutes`);
};

const activeOnMain = (shell: Shell): string | undefined => shell.getCanvasState('main').active?.definitionId;

const tableRows = (shell: Shell): number => {
  const table = nodes(shell.flattenRenderTree(shell.getCanvasRenderTree('main')) as Node[]).find((node) => node.type === 'component' && node.name === 'Table');
  const rows = table?.props?.['rows'];
  return Array.isArray(rows) ? rows.length : -1;
};

const opens = async (shell: Shell, id: string): Promise<number> => {
  try {
    shell.push('main', id);
  } catch {
    return -2;
  }
  await settle(4000);
  return activeOnMain(shell) === id ? tableRows(shell) : -2;
};

const checks: [string, boolean][] = [];
const note = (said: Said): string => `${said.seconds}s, tools ${said.tools.join(' > ') || 'none'}: "${said.text.slice(0, 160)}"`;

const first = await login('alex');
const built = await ask(first, 'give me a new action that lets me filter deals by expiry date');
const kept = activeOnMain(first) ?? '';
const shownAtBuild = tableRows(first);
checks.push([`the chat built a screen and placed it on main (${kept}, ${shownAtBuild} rows; ${note(built)})`, built.tools.some((tool) => tool.includes('build')) && kept.length > 0 && !['home', 'crm.deals'].includes(kept) && shownAtBuild > 0]);

const keep = await ask(first, 'keep that screen');
checks.push([`asked to keep it, the chat called keep_screens (${note(keep)})`, keep.tools.some((tool) => tool.includes('keep'))]);

const second = await login('alex');
const reopened = await opens(second, kept);
checks.push([`after a reload the kept screen opens with its rows (${reopened} rows)`, reopened > 0]);

const edit = await ask(second, `change the screen ${kept}: add the name of the deal's owner as a column`);
const editedOn = activeOnMain(second);
const editedNode = nodes(second.flattenRenderTree(second.getCanvasRenderTree('main')) as Node[]).find((node) => node.type === 'component' && node.name === 'Table');
const columns = Array.isArray(editedNode?.props?.['columns']) ? (editedNode?.props?.['columns'] as { label?: string }[]).map((column) => String(column.label ?? '')) : [];
checks.push([`the chat edited the kept screen in place (${editedOn}, columns ${columns.join(', ')}; ${note(edit)})`, edit.tools.some((tool) => tool.includes('build')) && editedOn === kept && columns.some((label) => /owner/i.test(label))]);

const keepEdit = await ask(second, 'keep it');
checks.push([`the edit is kept (${note(keepEdit)})`, keepEdit.tools.some((tool) => tool.includes('keep'))]);

const extra = await ask(second, 'build a table of the 5 most recently created companies with name and industry');
const thrown = activeOnMain(second) ?? '';
const discard = await ask(second, 'throw away the screen you just built');
checks.push([`a screen built and then discarded (${thrown}; ${note(extra)} | ${note(discard)})`, discard.tools.some((tool) => tool.includes('discard')) && thrown !== kept]);

const third = await login('alex');
const keptAgain = await opens(third, kept);
const thirdColumns = (() => {
  const table = nodes(third.flattenRenderTree(third.getCanvasRenderTree('main')) as Node[]).find((node) => node.type === 'component' && node.name === 'Table');
  return Array.isArray(table?.props?.['columns']) ? (table?.props?.['columns'] as { label?: string }[]).map((column) => String(column.label ?? '')) : [];
})();
checks.push([`after another reload the kept screen carries the edit (${keptAgain} rows, columns ${thirdColumns.join(', ')})`, keptAgain > 0 && thirdColumns.some((label) => /owner/i.test(label))]);
const discardedAgain = await opens(third, thrown);
checks.push([`and the discarded one is gone (${thrown} opens: ${discardedAgain === -2 ? 'no' : 'yes'})`, discardedAgain === -2]);

let ok = true;
for (const [label, pass] of checks) {
  ok = ok && pass;
  console.log(`${pass ? '✓' : '✗'} ${label}`);
}
console.log(ok ? '\nOK — built, kept, reloaded, edited, kept again, discarded, through the real session.' : '\nFAIL.');
process.exit(ok ? 0 : 1);
