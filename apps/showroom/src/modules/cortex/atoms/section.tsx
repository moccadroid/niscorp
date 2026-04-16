import type { FC } from 'react';

// Title + scrollable body pre-block with color variants.
// Used everywhere for "Input", "Output", "Error", "Reasoning",
// "Evaluated", "Expected", etc.

export type SectionVariant = 'normal' | 'error' | 'pass' | 'fail' | 'muted' | 'info';

const PALETTE: Record<SectionVariant, { bg: string; fg: string; border: string }> = {
  normal: { bg: '#f9fafb', fg: '#1f2937', border: '#e5e7eb' },
  muted: { bg: '#f3f4f6', fg: '#4b5563', border: '#e5e7eb' },
  error: { bg: '#fef2f2', fg: '#991b1b', border: '#fecaca' },
  pass: { bg: '#ecfdf5', fg: '#065f46', border: '#a7f3d0' },
  fail: { bg: '#fef2f2', fg: '#991b1b', border: '#fecaca' },
  info: { bg: '#eff6ff', fg: '#1e3a8a', border: '#bfdbfe' },
};

export const Section: FC<{ title: string; body: string; variant?: SectionVariant }> = ({
  title,
  body,
  variant = 'normal',
}) => {
  const c = PALETTE[variant];
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          color: '#6b7280',
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <pre
        style={{
          margin: 0,
          padding: 12,
          background: c.bg,
          color: c.fg,
          border: `1px solid ${c.border}`,
          borderRadius: 6,
          fontSize: 12,
          fontFamily: 'ui-monospace, Menlo, monospace',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          overflow: 'auto',
          maxHeight: 320,
        }}
      >
        {body}
      </pre>
    </div>
  );
};
