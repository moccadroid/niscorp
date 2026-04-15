import type { FC } from 'react';

// Path status badge — reflects a `stream.select(path).on/.onFinal`
// subscription. Amber while streaming, green once finalized.

export type PathStatus = {
  path: string;
  value: unknown;
  isFinal: boolean;
  finalizedAt?: number;
};

export const PathBadge: FC<{ status: PathStatus }> = ({ status }) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 10px',
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 600,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
      background: status.isFinal ? '#dcfce7' : '#fef3c7',
      color: status.isFinal ? '#166534' : '#92400e',
      border: `1px solid ${status.isFinal ? '#86efac' : '#fde68a'}`,
    }}
  >
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: status.isFinal ? '#22c55e' : '#f59e0b',
      }}
    />
    {status.path}
    {status.isFinal && status.finalizedAt !== undefined && (
      <span style={{ fontWeight: 400, opacity: 0.7 }}>{status.finalizedAt.toFixed(0)}ms</span>
    )}
  </div>
);

export const PathBadges: FC<{ statuses: PathStatus[] }> = ({ statuses }) =>
  statuses.length === 0 ? null : (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
      {statuses.map((s) => (
        <PathBadge key={s.path} status={s} />
      ))}
    </div>
  );
