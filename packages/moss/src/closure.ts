import { auditAction, collectChannels } from '@niscorp/nova';
import type { ActionDefinition } from '@niscorp/nova';
import type { ClosureAuditor } from '@niscorp/charter';
import type { LayoutVariant } from './app';

// The per-role closure auditor — nova's own action audit, run over a
// role's granted set: each granted definition is checked against a world
// containing ONLY that set, and the issues kept are the CROSS-ACTION ones
// (a push target outside the closure). A definition-level wart (a loose
// bind, a dead ref) is not a closure break — the audit's other findings
// stay with the definition tooling, not the boot refusal.
//
// The role's granted variant ids ride in as the auditor's second argument
// (the charter verifier passes them): substituted before auditing, so the
// closure sees the role's EFFECTIVE definitions — a variant's push targets
// and channels are audited for exactly the roles that hold it.
export const auditClosure = (definitions: Record<string, ActionDefinition>, variants: Record<string, LayoutVariant> = {}): ClosureAuditor => {
  return (grantedIds, layoutIds = []) => {
    const bindings = new Map<string, ActionDefinition['layout']>();
    for (const id of layoutIds) {
      const variant = variants[id];
      if (variant !== undefined) bindings.set(variant.action, variant.layout);
    }
    const granted = grantedIds
      .map((id) => {
        const definition = definitions[id];
        if (definition === undefined) return undefined;
        const layout = bindings.get(id);
        return layout === undefined ? definition : { ...definition, layout };
      })
      .filter((definition): definition is ActionDefinition => definition !== undefined);
    const catalog = granted.map((definition) => ({ id: definition.id, input: definition.input ?? {} }));
    const channels = [
      ...new Set(
        granted.flatMap((definition) => {
          const found = collectChannels(definition);
          return [...found.emits, ...found.listens];
        }),
      ),
    ];
    const issues: string[] = [];
    for (const definition of granted) {
      const audit = auditAction(definition, { catalog, channels });
      if (audit.ok) continue;
      for (const issue of audit.issues) {
        // Cross-action wiring only — and a TEMPLATE target ({{…}}) is
        // resolved at runtime, not a static closure break.
        if (issue.includes('which is not in the catalog') && !issue.includes('{{')) issues.push(`${definition.id}: ${issue}`);
      }
    }
    return issues;
  };
};
