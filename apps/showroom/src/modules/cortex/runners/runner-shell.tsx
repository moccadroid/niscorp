// ═══════════════════════════════════════════════════════════
// Runner shell — visual primitives shared across Cortex demos
// ═══════════════════════════════════════════════════════════
//
// Every Cortex demo runner needs:
//   - Section blocks (title + scrollable body, with color variants)
//   - A retries panel (when the agent's auto-retry fires)
//   - An error block + raw-model-output block
//   - A pass/fail badge
//   - A "Run" button
//
// All the runner-specific stuff (which agent, which prompt, what to
// compare against) lives in the runner itself. The shell just gives
// each runner a consistent look and shaves ~150 lines of duplication.

import type { FC, ReactNode } from 'react';
import type { CortexError } from '@niscorp/cortex';

export const PROVIDER = 'groq' as const;
export const DEFAULT_MODEL = 'openai/gpt-oss-120b';

// ───────────────────────────────────────────────────────────
// Stable JSON equality (key-sorted) — used by every comparison
// ───────────────────────────────────────────────────────────

export const stableJson = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`).join(',')}}`;
};

export const deepEqual = (a: unknown, b: unknown): boolean => stableJson(a) === stableJson(b);

// ───────────────────────────────────────────────────────────
// Shared types
// ───────────────────────────────────────────────────────────

export type RetryAttempt = {
  attempt: number;
  rawContent: string;
  error: CortexError;
};

export type SectionVariant = 'normal' | 'error' | 'pass' | 'fail' | 'muted' | 'info';

const PALETTE: Record<SectionVariant, { bg: string; fg: string; border: string }> = {
  normal: { bg: '#f9fafb', fg: '#1f2937', border: '#e5e7eb' },
  muted: { bg: '#f3f4f6', fg: '#4b5563', border: '#e5e7eb' },
  error: { bg: '#fef2f2', fg: '#991b1b', border: '#fecaca' },
  pass: { bg: '#ecfdf5', fg: '#065f46', border: '#a7f3d0' },
  fail: { bg: '#fef2f2', fg: '#991b1b', border: '#fecaca' },
  info: { bg: '#eff6ff', fg: '#1e3a8a', border: '#bfdbfe' },
};

// ───────────────────────────────────────────────────────────
// Section: title + scrollable body
// ───────────────────────────────────────────────────────────

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

// ───────────────────────────────────────────────────────────
// Demo intro banner (the "what is this demo showing" callout)
// ───────────────────────────────────────────────────────────

export const DemoBanner: FC<{ tag: string; children: ReactNode }> = ({ tag, children }) => (
  <div
    style={{
      padding: '16px 20px',
      background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)',
      border: '1px solid #dbeafe',
      borderLeft: '4px solid #2563eb',
      borderRadius: 10,
    }}
  >
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: '#2563eb',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 6,
      }}
    >
      {tag}
    </div>
    <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.6 }}>{children}</div>
  </div>
);

// ───────────────────────────────────────────────────────────
// Run button + provider/model badge
// ───────────────────────────────────────────────────────────

export const RunButton: FC<{
  label: string;
  runningLabel: string;
  onRun: () => void;
  isRunning: boolean;
}> = ({ label, runningLabel, onRun, isRunning }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
    <button
      type="button"
      onClick={onRun}
      disabled={isRunning}
      style={{
        padding: '10px 18px',
        background: isRunning ? '#9ca3af' : '#2563eb',
        color: 'white',
        border: 'none',
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 600,
        cursor: isRunning ? 'wait' : 'pointer',
      }}
    >
      {isRunning ? runningLabel : label}
    </button>
    <div style={{ fontSize: 12, color: '#6b7280' }}>
      provider: <strong>{PROVIDER}</strong> · model: <strong>{DEFAULT_MODEL}</strong>
    </div>
  </div>
);

// ───────────────────────────────────────────────────────────
// Retries panel (shown whenever Cortex auto-retried)
// ───────────────────────────────────────────────────────────
//
// `outcome` controls the visual treatment:
//   'pending'   — run still in progress, amber tone (live updates)
//   'corrected' — run eventually succeeded after the retries; amber
//                 + a "✓ corrected" framing so it doesn't look like
//                 the run failed
//   'failed'    — run failed after exhausting retries; red tone
//
// The semantic difference is critical: "Cortex caught and fixed the
// model's mistake" reads very differently from "the run failed."

export type RetriesPanelOutcome = 'pending' | 'corrected' | 'failed';

export const RetriesPanel: FC<{
  attempts: ReadonlyArray<RetryAttempt>;
  outcome?: RetriesPanelOutcome;
}> = ({ attempts, outcome = 'pending' }) => {
  if (attempts.length === 0) return null;

  const palette =
    outcome === 'failed'
      ? {
          headerColor: '#991b1b',
          bannerBg: '#fef2f2',
          bannerBorder: '#fecaca',
          bannerText: '#991b1b',
          attemptHeaderColor: '#9a3412',
          attemptBg: '#fef2f2',
          attemptFg: '#7f1d1d',
          attemptBorder: '#fecaca',
          arrowColor: '#9a3412',
        }
      : {
          // 'pending' and 'corrected' both use amber. The header text
          // distinguishes them.
          headerColor: '#92400e',
          bannerBg: '#fffbeb',
          bannerBorder: '#fde68a',
          bannerText: '#92400e',
          attemptHeaderColor: '#9a3412',
          attemptBg: '#fffbeb',
          attemptFg: '#78350f',
          attemptBorder: '#fde68a',
          arrowColor: '#9a3412',
        };

  const headerLabel =
    outcome === 'corrected'
      ? `✓ Corrected by Cortex · ${attempts.length} retry${attempts.length === 1 ? '' : 's'}`
      : outcome === 'failed'
        ? `✗ Failed after ${attempts.length} retry${attempts.length === 1 ? '' : 's'}`
        : `Retries · ${attempts.length} attempt${attempts.length === 1 ? '' : 's'} corrected by Cortex`;

  const bannerText =
    outcome === 'corrected'
      ? "The model's first response failed validation. Cortex automatically re-prompted with the issue and the prior output, and the model produced a valid result on a subsequent attempt. Each prior attempt is shown below — they are not run failures, they are auto-corrections."
      : outcome === 'failed'
        ? "The model's responses failed validation and Cortex exhausted its retry budget. Each attempt below shows what the model said and why it was rejected."
        : "The model's response failed validation. Cortex automatically re-prompted with the issue and the prior output. Each attempt below shows what the model said and why it was rejected.";

  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          color: palette.headerColor,
          marginBottom: 6,
        }}
      >
        {headerLabel}
      </div>
      <div
        style={{
          padding: '8px 12px 4px 12px',
          background: palette.bannerBg,
          border: `1px solid ${palette.bannerBorder}`,
          borderRadius: 6,
          fontSize: 12,
          color: palette.bannerText,
          marginBottom: 8,
        }}
      >
        {bannerText}
      </div>
      {attempts.map((a) => (
        <div key={a.attempt} style={{ marginTop: 12 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              color: palette.attemptHeaderColor,
              marginBottom: 6,
            }}
          >
            Attempt {a.attempt} · {outcome === 'corrected' ? 'auto-corrected' : 'failed'}
          </div>
          <pre
            style={{
              margin: 0,
              padding: 12,
              background: palette.attemptBg,
              color: palette.attemptFg,
              border: `1px solid ${palette.attemptBorder}`,
              borderRadius: 6,
              fontSize: 12,
              fontFamily: 'ui-monospace, Menlo, monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              overflow: 'auto',
              maxHeight: 240,
            }}
          >
            {a.rawContent || '<empty content>'}
          </pre>
          <div
            style={{
              marginTop: 4,
              fontSize: 12,
              color: palette.arrowColor,
              fontStyle: 'italic',
            }}
          >
            ↳ {a.error.code}: {a.error.message}
          </div>
        </div>
      ))}
    </div>
  );
};

// ───────────────────────────────────────────────────────────
// Pass/fail badge
// ───────────────────────────────────────────────────────────

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
