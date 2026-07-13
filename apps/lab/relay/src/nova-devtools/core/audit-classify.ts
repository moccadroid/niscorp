import type { ActionDefinition, LayoutNode } from '@niscorp/nova';

// Classifies each auditAction issue against the definition it came from —
// deterministically, not by guessing at names. The audit's static walk has
// three known blind spots; for each we compute the ground truth from the
// definition itself:
//   loop scope — a `binds "$.x"` where x is a loop `as:` var (or the
//     renderer-reserved `index`/`items`) IS in scope at runtime
//   prop refs — a `listens on ref "x"` where x appears as a ref-ish prop
//     value (`ref` / `*Ref` keys anywhere inside a component's props) is
//     dispatched by the component (e.g. Table's rowRef / cell.ref)
//   templates — a `{{…}}` nav target resolves at runtime
// Anything unexplained is `address`: the audit found it and we can't account
// for it, so a human should.

export type IssueClass = { kind: 'address' } | { kind: 'info'; tag: string; reason: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const walk = (node: unknown, visit: (record: Record<string, unknown>) => void): void => {
  if (Array.isArray(node)) return node.forEach((child) => walk(child, visit));
  if (!isRecord(node)) return;
  visit(node);
  for (const value of Object.values(node)) walk(value, visit);
};

// Every loop `as:` name declared anywhere in the layout tree.
const collectLoopVars = (layout: LayoutNode | undefined): Set<string> => {
  const vars = new Set<string>();
  walk(layout, (record) => {
    if (typeof record['as'] === 'string' && record['for'] !== undefined) vars.add(record['as']);
  });
  return vars;
};

// Every string carried by a ref-ish key (`ref` / `*Ref`) INSIDE a component's
// props — node-level `ref:` is visible to the audit already, props are not.
const collectPropRefs = (layout: LayoutNode | undefined): Set<string> => {
  const refs = new Set<string>();
  walk(layout, (record) => {
    if (record['component'] === undefined || !isRecord(record['props'])) return;
    walk(record['props'], (propsRecord) => {
      for (const [key, value] of Object.entries(propsRecord)) {
        if ((key === 'ref' || key.endsWith('Ref')) && typeof value === 'string' && value !== '') refs.add(value);
      }
    });
  });
  return refs;
};

export const classifyIssue = (issue: string, definition: ActionDefinition): IssueClass => {
  const layout = typeof definition.layout === 'object' ? definition.layout : undefined;

  const bind = issue.match(/binds "\$\.([\w.]+)"/);
  if (bind !== null) {
    const root = (bind[1] ?? '').split('.')[0] ?? '';
    if (root === 'index' || root === 'items')
      return { kind: 'info', tag: 'loop scope', reason: `\`${root}\` is a renderer-reserved loop variable` };
    if (collectLoopVars(layout).has(root))
      return { kind: 'info', tag: 'loop var', reason: `\`${root}\` is a loop \`as:\` variable — in scope at runtime` };
  }

  const ref = issue.match(/ref "([^"]+)"/);
  if (ref !== null && issue.includes('listens') && collectPropRefs(layout).has(ref[1] ?? ''))
    return { kind: 'info', tag: 'prop ref', reason: 'dispatched by a component from a props value (e.g. Table rowRef / cell.ref)' };

  if (issue.includes('{{'))
    return { kind: 'info', tag: 'template', reason: 'target resolves from data at runtime — statically unknowable' };

  return { kind: 'address' };
};
