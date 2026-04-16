import type { FC } from 'react';

// Warning shown in place of the interactive demo when the user
// has no API key stored for the demo's provider. Points them at
// the Settings doc page where keys are configured.
export const NoApiKey: FC<{ provider: string }> = ({ provider }) => (
  <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>
    <div
      style={{
        padding: '12px 16px',
        background: '#fffbeb',
        border: '1px solid #fde68a',
        borderLeft: '4px solid #f59e0b',
        borderRadius: 6,
        fontSize: 13,
        color: '#92400e',
      }}
    >
      No API key for <strong>{provider}</strong>. Configure it in Settings to run live.
    </div>
  </div>
);
