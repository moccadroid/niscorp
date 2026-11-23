import type { DatabaseSchema } from '../schemas/database.schema.js';

// A view over anything but the tables vex reads would be answered again by no
// write, and would show rows no grant names.
export const viewMisfits = (views: readonly string[], schema: DatabaseSchema): string[] => {
  const tables = new Set(schema.entities.flatMap((e) => (e.view === undefined ? [e.name] : [])));
  return views.flatMap((name) => {
    const entity = schema.entities.find((e) => e.name === name);
    if (entity === undefined) return [`"${name}" is not in the database, or the introspection leaves it out (\`entities\`, \`exclude\`)`];
    if (entity.view === undefined) return [`"${name}" is a table`];
    const unread = entity.view.reads.filter((read) => !tables.has(read));
    return [
      ...(unread.length > 0 ? [`"${name}" reads ${unread.map((read) => `"${read}"`).join(', ')}, which vex does not read`] : []),
      ...(entity.view.outside !== undefined ? [`"${name}" uses ${entity.view.outside.join(', ')}, which vex does not follow`] : []),
    ];
  });
};
