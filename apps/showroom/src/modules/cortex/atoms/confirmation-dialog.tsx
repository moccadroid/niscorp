import type { FC } from 'react';

// Renders one Cortex confirmation request. Before the user
// responds: yellow callout with the tool's input + Approve/Deny
// buttons. After: a green/red badge with the resolution.

export type ConfirmationRequest = {
  toolId: string;
  input: unknown;
  resolved: boolean;
  approved?: boolean;
};

type Props = {
  request: ConfirmationRequest;
  onApprove: () => void;
  onDeny: () => void;
};

export const ConfirmationDialog: FC<Props> = ({ request, onApprove, onDeny }) => {
  if (request.resolved) {
    return (
      <div
        style={{
          padding: '10px 14px',
          background: request.approved ? '#ecfdf5' : '#fef2f2',
          border: `1px solid ${request.approved ? '#a7f3d0' : '#fecaca'}`,
          borderLeft: `4px solid ${request.approved ? '#059669' : '#dc2626'}`,
          borderRadius: 6,
          fontSize: 12,
          color: request.approved ? '#065f46' : '#991b1b',
          fontWeight: 600,
        }}
      >
        {request.approved ? '✓ Approved' : '✗ Denied'}: {request.toolId}
      </div>
    );
  }
  return (
    <div
      style={{
        padding: '12px 14px',
        background: '#fffbeb',
        border: '1px solid #fde68a',
        borderLeft: '4px solid #f59e0b',
        borderRadius: 6,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>
        Confirmation required: {request.toolId}
      </div>
      <pre
        style={{
          margin: 0,
          padding: 8,
          background: '#fef3c7',
          borderRadius: 4,
          fontSize: 11,
          fontFamily: 'ui-monospace, Menlo, monospace',
          color: '#78350f',
          whiteSpace: 'pre-wrap',
          maxHeight: 120,
          overflow: 'auto',
        }}
      >
        {JSON.stringify(request.input, null, 2)}
      </pre>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onApprove}
          style={{
            padding: '6px 16px',
            background: '#059669',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Approve
        </button>
        <button
          onClick={onDeny}
          style={{
            padding: '6px 16px',
            background: '#dc2626',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Deny
        </button>
      </div>
    </div>
  );
};
