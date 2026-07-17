import { auditAction, collectChannels } from '@niscorp/nova';
import type { ActionDefinition } from '@niscorp/nova';
import type { ClosureAuditor } from '@niscorp/charter';

// The per-role closure auditor — nova's own action audit, run over a
// role's granted set: each granted definition is checked against a world
// containing ONLY that set, and the issues kept are the CROSS-ACTION ones
// (a push target outside the closure). A definition-level wart (a loose
// bind, a dead ref) is not a closure break — the audit's other findings
// stay with the definition tooling, not the boot refusal.
export const auditClosure = (definitions: Record<string, ActionDefinition>): ClosureAuditor => {
  return (grantedIds) => {
    const granted = grantedIds
      .map((id) => definitions[id])
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
