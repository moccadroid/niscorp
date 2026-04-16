import type { FC } from 'react';

// Green/red pill at the bottom of a demo result. `passLabel` and
// `failLabel` let each kind phrase its pass/fail condition in domain
// terms ("Evaluated matches expected", "Policy denied as expected").

export const PassFailBadge: FC<{ pass: boolean; passLabel: string; failLabel: string }> = ({
  pass,
  passLabel,
  failLabel,
}) => (
  <div
    style={{
      padding: '12px 16px',
      background: pass ? '#ecfdf5' : '#fef2f2',
      border: `1px solid ${pass ? '#a7f3d0' : '#fecaca'}`,
      borderRadius: 6,
      fontSize: 13,
      color: pass ? '#065f46' : '#991b1b',
      fontWeight: 600,
    }}
  >
    {pass ? `✓ ${passLabel}` : `✗ ${failLabel}`}
  </div>
);
