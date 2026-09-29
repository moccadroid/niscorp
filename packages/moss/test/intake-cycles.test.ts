import { describe, it, expect } from 'vitest';
import type { ActionDefinition } from '@niscorp/nova';
import { runIntake } from '../src/integrations';
import type { IntakeContext } from '../src/integrations';

// ═══════════════════════════════════════════════════════════════
// A bundle whose steps can never end is refused at intake. nova stops such a
// chain at its budget when it runs, but a bundle is a stranger's path into
// every principal's shell, and the loop is visible in the definitions — so it
// is refused here, with the path, rather than served. A loop can close through
// the host's own triggers, so the host's actions are walked with the bundle's;
// a loop the host has on its own is not the bundle's to answer.
// ═══════════════════════════════════════════════════════════════

const ctx = (hostActions: Record<string, ActionDefinition> = {}): IntakeContext => ({
  integrationId: 'acme',
  components: new Map(),
  fingerprints: new Set<string>(),
  attachable: new Set<string>(),
  menuSlots: new Set<string>(),
  hostActions,
});

const bundle = (actions: Record<string, unknown>): unknown => ({ integration: 'acme', meta: {}, actions });
const reasonsOf = (r: ReturnType<typeof runIntake>): string[] => (r.ok ? [] : r.reasons);

describe('runIntake — a chain that never ends', () => {
  it('refuses a trigger that re-emits its own channel', () => {
    const result = runIntake(bundle({ 'ext.staff.acme.loop': { id: 'ext.staff.acme.loop', triggers: [{ message: 'x', do: [{ emit: { channel: 'x' } }] }] } }), ctx());
    expect(result.ok).toBe(false);
    expect(reasonsOf(result)).toContain('a chain of steps that never ends: x —emit (ext.staff.acme.loop)→ x');
  });

  it('refuses a loop that closes through the host', () => {
    const host: ActionDefinition = { id: 'members.list', triggers: [{ message: 'acme-ping', do: [{ emit: { channel: 'host-pong' } }] }] };
    const echo = { id: 'ext.staff.acme.echo', triggers: [{ message: 'host-pong', do: [{ emit: { channel: 'acme-ping' } }] }] };
    const result = runIntake(bundle({ 'ext.staff.acme.echo': echo }), ctx({ 'members.list': host }));
    expect(result.ok).toBe(false);
    expect(reasonsOf(result)).toContainEqual(expect.stringContaining('ext.staff.acme.echo'));
  });

  it('does not refuse a bundle for a loop the host has on its own', () => {
    const host: ActionDefinition = { id: 'members.list', triggers: [{ message: 'y', do: [{ emit: { channel: 'y' } }] }] };
    const quiet = { id: 'ext.staff.acme.quiet', triggers: [{ message: 'y', do: [{ increment: 'n' }] }] };
    expect(runIntake(bundle({ 'ext.staff.acme.quiet': quiet }), ctx({ 'members.list': host })).ok).toBe(true);
  });

  it('accepts writers that announce and viewers that re-read', () => {
    const viewer = { id: 'ext.staff.acme.viewer', triggers: [{ message: 'acme-changed', do: [{ reload: true }] }] };
    const writer = { id: 'ext.staff.acme.writer', triggers: [{ event: 'ui:click', ref: 'save', do: [{ emit: { channel: 'acme-changed' } }] }] };
    expect(runIntake(bundle({ 'ext.staff.acme.viewer': viewer, 'ext.staff.acme.writer': writer }), ctx()).ok).toBe(true);
  });
});
