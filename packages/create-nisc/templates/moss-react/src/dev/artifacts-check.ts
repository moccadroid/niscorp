// The artifacts check — what makes `src/app/` a tree of DATA: everything in it
// is pure JSON (no function, no Date, no undefined, no class instance) and
// parses through its own schema, so a code file cannot pass for an artifact
// (AGENTS.md, review item 6a). It also holds rule 14: an action's `input`
// declares only keys its `data` has.
import { ActionDefinitionSchema, LayoutNodeSchema } from '@niscorp/nova';
import { actions } from '../app/action-catalog';
import { assignments } from '../app/charter/assignments';
import { charter } from '../app/charter/charter';
import { shell } from '../app/shell/shell';

let failures = 0;
const check = (name: string, passed: boolean, detail = ''): void => {
  console.log(`${passed ? '[pass]' : '[fail]'} ${name}${!passed && detail !== '' ? ` — ${detail}` : ''}`);
  if (!passed) failures += 1;
};

// The first thing in a value that is not JSON, as a path — or '' when all of it is.
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

pure('the action catalog', actions);
pure('the charter', charter);
pure('the assignments', assignments);
pure('the shell', shell);
if (shell.layout !== undefined) parses('the shell’s frame', () => LayoutNodeSchema.parse(shell.layout));

for (const [id, definition] of Object.entries(actions)) {
  check(`action "${id}" is catalogued under its own id`, definition.id === id, `its id is "${definition.id}"`);
  parses(`action "${id}"`, () => ActionDefinitionSchema.parse(definition));
  // rule 14: what an opener may seed is a subset of the action's data
  const properties = isRecord(definition.input) && isRecord(definition.input['properties']) ? Object.keys(definition.input['properties']) : [];
  const unknown = properties.filter((key) => !(key in (definition.data ?? {})));
  check(`action "${id}" declares only inputs its data has`, unknown.length === 0, unknown.join(', '));
}

console.log(failures === 0 ? '[pass] artifacts: all checks passed' : `[fail] artifacts: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
