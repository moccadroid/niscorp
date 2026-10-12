import { auditAction, collectChannels } from '@action';
import type { ActionDefinition } from '@action';
import { loopVarsOf, refsOf } from './walk';

export type IssueClass = { kind: 'address' } | { kind: 'info'; tag: string; reason: string };

export const classifyAudit = (issue: string, definition: ActionDefinition): IssueClass => {
  const layout = typeof definition.layout === 'object' ? definition.layout : undefined;

  const bind = issue.match(/binds "\$\.([\w.]+)"/);
  if (bind !== null) {
    const root = (bind[1] ?? '').split('.')[0] ?? '';
    if (root === 'index' || root === 'items') {
      return { kind: 'info', tag: 'loop scope', reason: `\`${root}\` is a renderer-reserved loop variable` };
    }
    if (loopVarsOf(layout).has(root)) {
      return { kind: 'info', tag: 'loop var', reason: `\`${root}\` is a loop \`as:\` variable — in scope at runtime` };
    }
  }

  const ref = issue.match(/ref "([^"]+)"/);
  if (ref !== null && issue.includes('listens') && refsOf(layout).has(ref[1] ?? '')) {
    return { kind: 'info', tag: 'prop ref', reason: 'dispatched by a component from a props value (e.g. Table rowRef / cell.ref)' };
  }

  if (issue.includes('{{')) {
    return { kind: 'info', tag: 'template', reason: 'target resolves from data at runtime — statically unknowable' };
  }

  return { kind: 'address' };
};

export type ClassifiedIssue = { issue: string } & IssueClass;
export type CatalogAuditRow = { id: string; address: number; issues: ClassifiedIssue[] };

export const auditCatalog = (
  definitions: Record<string, ActionDefinition> | readonly ActionDefinition[],
): CatalogAuditRow[] => {
  const defs = Array.isArray(definitions) ? [...definitions] : Object.values(definitions);
  const catalog = defs.map((definition) => ({ id: definition.id, ...(definition.input !== undefined ? { input: definition.input } : {}) }));
  const channels = [
    ...new Set(
      defs.flatMap((definition) => {
        const usage = collectChannels(definition);
        return [...usage.emits, ...usage.listens];
      }),
    ),
  ];
  return defs
    .map((definition): CatalogAuditRow => {
      const issues = auditAction(definition, { catalog, channels }).issues.map((issue): ClassifiedIssue => ({ issue, ...classifyAudit(issue, definition) }));
      issues.sort((a, b) => Number(a.kind === 'info') - Number(b.kind === 'info'));
      return { id: definition.id, address: issues.filter((issue) => issue.kind === 'address').length, issues };
    })
    .filter((row) => row.issues.length > 0)
    .sort((a, b) => b.address - a.address);
};
