import type { FC } from 'react';
import { Chip } from '@showroom/chrome/stage/ui';

// Path status badge — reflects a `stream.select(path).on/.onFinal`
// subscription. Amber while streaming, green once finalized.

export type PathStatus = {
  path: string;
  value: unknown;
  isFinal: boolean;
  finalizedAt?: number;
};

export const PathBadge: FC<{ status: PathStatus }> = ({ status }) => (
  <Chip tone={status.isFinal ? 'ok' : 'warn'} mono>
    {status.isFinal ? '✓' : '…'} {status.path}
    {status.isFinal && status.finalizedAt !== undefined && <span style={{ fontWeight: 400, opacity: 0.7 }}>{status.finalizedAt.toFixed(0)}ms</span>}
  </Chip>
);

export const PathBadges: FC<{ statuses: PathStatus[] }> = ({ statuses }) =>
  statuses.length === 0 ? null : (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {statuses.map((s) => (
        <PathBadge key={s.path} status={s} />
      ))}
    </div>
  );
