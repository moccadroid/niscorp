import * as demo from './vex-query.demo';
import source from './vex-query.demo?raw';

export const story = {
  id: 'vex-query',
  name: 'Edit a Vex query',
  description:
    'Loom editing a Vex query. The editor is generated from Vex\'s QuerySchema. The subject is one query. The preview runs the query against an in-browser Postgres and shows the rows; editing the query re-runs it. Widgets: from/fields/sort/filter fields autocomplete column names from the database schema, and comparison operands are typed by the chosen column. The preview uses engine.test, which runs the real pipeline (resolve, analyze, compile SQL, execute) with no LLM and returns up to 5 rows.',
  category: 'Plugins',
  kind: 'plugins' as const,
  ...demo,
  source,
};
