import { compile, jsonquery } from '@jsonquerylang/jsonquery';
import { JSON_QUERIES, tasksOf } from './jsonquery.shared.mjs';

export default {
  id: 'jsonquery',
  name: 'JSON Query (JSON format)',
  package: '@jsonquerylang/jsonquery',
  transform: 'json',
  usesEval: false,
  prepared: true,
  notes: 'The query as JSON data. prepare is compile, which turns the query into a closure without checking it against anything; run is that closure. Built-in functions only.',
  prepare: (query) => compile(query),
  run: (compiled, input) => compiled(input),
  oneShot: (query, input) => jsonquery(input, query),
  tasks: tasksOf(JSON_QUERIES),
};
