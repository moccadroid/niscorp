import { useMemo, useState, type FC } from 'react';
import {
  resolvePrincipal,
  resolveScoping,
  verifyCharter,
  type Charter,
  type VerifyReport,
} from '@niscorp/charter';

// ═══════════════════════════════════════════════════════════
// The Charter Lab — the one interactive surface every charter story
// drives. It resolves a charter against two opaque universes and shows,
// live: which roles a principal wears, the resolved set per section (with
// the FULL universe dimmed behind the granted ids — so deny-by-absence is
// visible), and the verifier's refusals. Pure: no server, no LLM, no DB.
// ═══════════════════════════════════════════════════════════

export type CharterLabProps = {
  charter: Charter;
  actions: readonly string[];
  data?: readonly string[];
  // Roles pre-selected on mount (the "principal"). Defaults to all roles.
  initialRoles?: readonly string[];
  // Assignments — only feeds the `subtractive-assigned` verifier check.
  assignments?: Record<string, readonly string[]>;
};

const C = {
  wrap: { display: 'flex', flexDirection: 'column' as const, gap: 14, padding: 20, fontSize: 13 },
  panel: { border: '1px solid var(--sr-border, #2a2a33)', borderRadius: 10, overflow: 'hidden' as const },
  head: { padding: '8px 12px', fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' as const, opacity: 0.6, borderBottom: '1px solid var(--sr-border, #2a2a33)' },
  body: { padding: 12 },
  cols: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  chips: { display: 'flex', flexWrap: 'wrap' as const, gap: 6 },
  json: { margin: 0, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap' as const, opacity: 0.85 },
  id: (granted: boolean) => ({
    fontFamily: 'ui-monospace, Menlo, monospace',
    fontSize: 12,
    padding: '2px 7px',
    borderRadius: 6,
    border: '1px solid',
    borderColor: granted ? 'rgba(52,211,153,0.4)' : 'transparent',
    background: granted ? 'rgba(52,211,153,0.12)' : 'transparent',
    color: granted ? 'inherit' : 'currentColor',
    opacity: granted ? 1 : 0.32,
  }),
  chip: (on: boolean) => ({
    padding: '4px 10px',
    borderRadius: 999,
    border: '1px solid',
    borderColor: on ? 'rgba(129,140,248,0.6)' : 'var(--sr-border, #2a2a33)',
    background: on ? 'rgba(129,140,248,0.16)' : 'transparent',
    fontSize: 12,
    cursor: 'pointer',
  }),
  grid: { display: 'flex', flexWrap: 'wrap' as const, gap: 5 },
  issue: (err: boolean) => ({
    display: 'flex',
    gap: 8,
    padding: '5px 10px',
    fontSize: 12,
    borderLeft: `3px solid ${err ? '#f87171' : '#fbbf24'}`,
    background: err ? 'rgba(248,113,113,0.08)' : 'rgba(251,191,36,0.08)',
  }),
  rule: { fontFamily: 'ui-monospace, Menlo, monospace', opacity: 0.7, flexShrink: 0 },
};

const UniverseSet: FC<{ universe: readonly string[]; granted: ReadonlySet<string>; label: string }> = ({ universe, granted, label }) => (
  <div style={C.panel}>
    <div style={C.head}>
      {label} — {granted.size}/{universe.length} granted
    </div>
    <div style={{ ...C.body, ...C.grid }}>
      {universe.length === 0 ? <span style={{ opacity: 0.4 }}>empty universe</span> : null}
      {universe.map((id) => (
        <span key={id} style={C.id(granted.has(id))}>
          {id}
        </span>
      ))}
    </div>
  </div>
);

export const CharterLab: FC<CharterLabProps> = ({ charter, actions, data = [], initialRoles, assignments = {} }) => {
  const roleNames = Object.keys(charter);
  const [worn, setWorn] = useState<readonly string[]>(initialRoles ?? roleNames);

  const grantedActions = useMemo<ReadonlySet<string>>(() => {
    try {
      return resolvePrincipal(charter, actions, worn, 'actions');
    } catch {
      return new Set();
    }
  }, [charter, actions, worn]);

  const grantedData = useMemo<ReadonlySet<string>>(() => {
    try {
      return resolvePrincipal(charter, data, worn, 'data');
    } catch {
      return new Set();
    }
  }, [charter, data, worn]);
  // Reach is a property of a ROLE, so wearing two shows two. They do not
  // conflict and nothing here has to choose: a principal holding several roles
  // gets one compiled policy each, merged (vex: `mergeScopePolicies`), and may
  // do anything any of them permits.
  const scoping = useMemo(
    () => worn.map((role) => [role, resolveScoping(charter, role)] as const).filter(([, profile]) => profile !== undefined),
    [charter, worn],
  );


  const report = useMemo<VerifyReport>(
    () => verifyCharter(charter, { actions, data }, assignments),
    [charter, actions, data, assignments],
  );

  const toggle = (role: string): void =>
    setWorn((cur) => (cur.includes(role) ? cur.filter((r) => r !== role) : [...cur, role]));

  return (
    <div style={C.wrap}>
      <div style={C.panel}>
        <div style={C.head}>charter</div>
        <pre style={{ ...C.body, ...C.json }}>{JSON.stringify(charter, null, 2)}</pre>
      </div>

      <div style={C.panel}>
        <div style={C.head}>principal — the roles worn (click to toggle the resolved set)</div>
        <div style={{ ...C.body, ...C.chips }}>
          {roleNames.map((role) => (
            <button key={role} type="button" style={C.chip(worn.includes(role))} onClick={() => toggle(role)}>
              {role}
            </button>
          ))}
        </div>
      </div>

      {/* HOW FAR, beside WHICH. A section says which ids a role holds; `scoping`
        * says how far they reach when they use them. Not inherited — toggle a
        * role that extends one carrying a profile and watch this stay empty,
        * which is the whole point: a desk extends a member's screens but not a
        * member's "only my own rows".
        *
        * Wear TWO roles that each name one and both appear. There is no conflict
        * to resolve here — one policy is compiled per role and the results are
        * merged, so a principal may do anything any of their roles permits. */}
      <div style={C.panel}>
        <div style={C.head}>reach — one profile per worn role</div>
        <div style={{ ...C.body, ...C.chips }}>
          {scoping.length === 0 ? (
            <span style={{ opacity: 0.55 }}>none — this principal reaches as far as each table's default</span>
          ) : (
            scoping.map(([role, profile]) => (
              <span key={role} style={C.id(true)}>
                {role} → {profile}
              </span>
            ))
          )}
        </div>
      </div>

      <div style={C.cols}>
        <UniverseSet universe={actions} granted={grantedActions} label="actions" />
        <UniverseSet universe={data} granted={grantedData} label="data" />
      </div>

      {(report.errors.length > 0 || report.warnings.length > 0) && (
        <div style={C.panel}>
          <div style={C.head}>
            verifier — {report.errors.length} error{report.errors.length === 1 ? '' : 's'}, {report.warnings.length} warning
            {report.warnings.length === 1 ? '' : 's'}
          </div>
          <div>
            {[...report.errors, ...report.warnings].map((issue, i) => (
              <div key={i} style={C.issue(issue.level === 'error')}>
                <span style={C.rule}>{issue.rule}</span>
                <span>{issue.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
