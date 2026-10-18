import { auditAction, collectChannels } from '@action';
import type { ActionDefinition } from '@action';

export type IssueClass = { kind: 'address' } | { kind: 'info'; tag: string; reason: string };

// A push whose target is a `{{…}}` template is reported as not in the catalog: it is known only when it runs.
export const classifyAudit = (issue: string): IssueClass =>
  issue.includes('{{') ? { kind: 'info', tag: 'template', reason: 'target resolves from data at runtime — statically unknowable' } : { kind: 'address' };

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
      const issues = auditAction(definition, { catalog, channels }).issues.map((issue): ClassifiedIssue => ({ issue, ...classifyAudit(issue) }));
      issues.sort((a, b) => Number(a.kind === 'info') - Number(b.kind === 'info'));
      return { id: definition.id, address: issues.filter((issue) => issue.kind === 'address').length, issues };
    })
    .filter((row) => row.issues.length > 0)
    .sort((a, b) => b.address - a.address);
};
