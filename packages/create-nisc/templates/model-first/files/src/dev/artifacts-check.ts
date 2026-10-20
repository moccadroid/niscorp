import { ActionDefinitionSchema, LayoutNodeSchema } from '@niscorp/nova';
import type { LayoutNode } from '@niscorp/nova';
import { actions } from '../app/action-catalog';
import { ANSWERS } from '../app/answers';
import { assignments } from '../app/charter/assignments';
import { charter } from '../app/charter/charter';
import { shell } from '../app/shell/shell';
import { buildRegistry } from '../ui/registry';

let failures = 0;
const check = (name: string, passed: boolean, detail = ''): void => {
  console.log(`${passed ? '[pass]' : '[fail]'} ${name}${!passed && detail !== '' ? ` — ${detail}` : ''}`);
  if (!passed) failures += 1;
};

const impurity = (value: unknown, path: string): string => {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return '';
  if (Array.isArray(value)) return value.map((item, at) => impurity(item, `${path}[${at}]`)).find((found) => found !== '') ?? '';
  if (typeof value !== 'object') return `${path} is a ${typeof value}`;
  if (Object.getPrototypeOf(value) !== Object.prototype) return `${path} is not a plain object`;
  return Object.entries(value).map(([key, inner]) => impurity(inner, path === '' ? key : `${path}.${key}`)).find((found) => found !== '') ?? '';
};
const pure = (name: string, value: unknown): void => {
  const found = impurity(value, '');
  check(`${name} is pure JSON`, found === '', found);
};
const parses = (name: string, parse: () => unknown): void => {
  try {
    parse();
    check(`${name} parses its schema`, true);
  } catch (error) {
    check(`${name} parses its schema`, false, error instanceof Error ? error.message.slice(0, 300) : String(error));
  }
};
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const propertiesOf = (schema: unknown): string[] => (isRecord(schema) && isRecord(schema['properties']) ? Object.keys(schema['properties']) : []);

const componentsIn = (node: unknown): string[] => {
  if (Array.isArray(node)) return node.flatMap(componentsIn);
  if (!isRecord(node)) return [];
  const own = typeof node['component'] === 'string' ? [node['component']] : [];
  return [...own, ...['children', 'then', 'else', 'do'].flatMap((key) => componentsIn(node[key]))];
};

pure('the action catalog', actions);
pure('the prepared answers', ANSWERS);
pure('the charter', charter);
pure('the assignments', assignments);
pure('the shell', shell);
if (shell.layout !== undefined) parses('the shell’s frame', () => LayoutNodeSchema.parse(shell.layout));

for (const [id, definition] of Object.entries(actions)) {
  check(`action "${id}" is catalogued under its own id`, definition.id === id, `its id is "${definition.id}"`);
  parses(`action "${id}"`, () => ActionDefinitionSchema.parse(definition));
  check(`action "${id}" says what it shows`, (definition.description ?? '') !== '');
  const unknown = propertiesOf(definition.input).filter((key) => !(key in (definition.data ?? {})));
  check(`action "${id}" declares only inputs its data has`, unknown.length === 0, unknown.join(', '));
}

const registered = new Set(buildRegistry().list());
const layouts: [string, LayoutNode | undefined][] = [['the frame', shell.layout], ...Object.values(actions).map((definition): [string, LayoutNode | undefined] => [`action "${definition.id}"`, definition.layout])];
for (const [name, layout] of layouts) {
  const missing = [...new Set(componentsIn(layout))].filter((component) => !registered.has(component));
  check(`${name} names only components the kit has`, missing.length === 0, missing.join(', '));
}

const ids = new Set<string>();
for (const answer of ANSWERS) {
  check(`prepared answer "${answer.id}" is the only one with its id`, !ids.has(answer.id));
  ids.add(answer.id);
  const action = actions[answer.action];
  check(`prepared answer "${answer.id}" opens an action the app has`, action !== undefined, answer.action);
  const takes = propertiesOf(action?.input);
  const extra = Object.keys(answer.input).filter((key) => !takes.includes(key));
  check(`prepared answer "${answer.id}" gives only inputs ${answer.action} takes`, extra.length === 0, extra.join(', '));
  const paths = [...Object.keys(answer.choose ?? {}), ...Object.keys(answer.set ?? {})];
  const lost = paths.filter((path) => path.split('.').reduce<unknown>((at, key) => (isRecord(at) || Array.isArray(at) ? (at as Record<string, unknown>)[key] : undefined), answer.input) === undefined);
  check(`prepared answer "${answer.id}" chooses and sets only inputs it has`, lost.length === 0, lost.join(', '));
}

console.log(failures === 0 ? '[pass] artifacts: all checks passed' : `[fail] artifacts: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
