import { describe, it, expect } from 'vitest';
import type { ActionDefinition } from '@niscorp/nova';
import { auditClosure } from '../src/closure';

// The closure auditor — nova's action audit over a role's granted set,
// keeping only the CROSS-ACTION break (a push to a target outside the
// closure). Definition-level warts are not closure breaks.
const home: ActionDefinition = {
  id: 'home',
  triggers: [{ event: 'ui:click', ref: 'open', do: [{ push: { action: 'crm.deals' } }] }],
};
const deals: ActionDefinition = { id: 'crm.deals' };
const orphanPush: ActionDefinition = {
  id: 'stray',
  triggers: [{ event: 'ui:click', ref: 'go', do: [{ push: { action: 'does.not.exist' } }] }],
};

describe('closure — the per-role wiring audit', () => {
  const audit = auditClosure({ home, 'crm.deals': deals, stray: orphanPush });

  it('a closure whose push targets are all present is clean', () => {
    expect(audit(['home', 'crm.deals'])).toEqual([]);
  });

  it('a push to a target outside the granted set is a closure break', () => {
    const issues = audit(['stray']);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.join(' ')).toContain('does.not.exist');
  });

  it('the same target becomes reachable once granted alongside', () => {
    // 'home' pushes 'crm.deals'; granting both closes the loop.
    expect(audit(['home', 'crm.deals'])).toEqual([]);
    // granting only 'home' leaves its target dangling.
    expect(audit(['home']).join(' ')).toContain('crm.deals');
  });

  it('an unknown granted id simply contributes nothing', () => {
    expect(audit(['ghost'])).toEqual([]);
  });
});
