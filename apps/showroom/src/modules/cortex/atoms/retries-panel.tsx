import type { FC } from 'react';
import type { CortexError } from '@niscorp/cortex';

// Displays Cortex's auto-retry attempts. Visual treatment depends on
// whether the run is still running, eventually succeeded (corrected),
// or ran out of retries (failed).
//
//   'pending'   — run still in progress, amber (live)
//   'corrected' — run eventually succeeded after retries; amber + a
//                 "✓ corrected" framing so it doesn't read like a
//                 failure
//   'failed'    — run failed after exhausting retries; red
//
// The semantic difference matters: "Cortex caught and fixed the
// model's mistake" reads very differently from "the run failed."

export type RetryAttempt = {
  attempt: number;
  rawContent: string;
  error: CortexError;
};

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
