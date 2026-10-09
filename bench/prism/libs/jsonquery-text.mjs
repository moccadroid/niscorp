import { compile, jsonquery, parse } from '@jsonquerylang/jsonquery';
import { TEXT, tasksOf } from './jsonquery.shared.mjs';

export default {
  id: 'jsonquery-text',
  name: 'JSON Query (text format)',
  package: '@jsonquerylang/jsonquery',
  transform: 'string',
  usesEval: false,
  prepared: true,
  notes: 'The same queries as the JSON row, in the text format. prepare is parse then compile; oneShot is jsonquery(data, text), which does both and runs. Built-in functions only.',
  prepare: (text) => compile(parse(text)),
  run: (compiled, input) => compiled(input),
  oneShot: (text, input) => jsonquery(input, text),
  tasks: tasksOf(TEXT),
};
