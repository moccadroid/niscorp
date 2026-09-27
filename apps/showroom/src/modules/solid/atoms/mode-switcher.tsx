import { useState, type FC, type ReactNode } from 'react';
import type { ValidationMode } from '@niscorp/solid';
import { INK, MONO, type Tone } from '@showroom/chrome/stage/ui';

// Render-prop helper for demos that want to toggle between
// trust / recover / strict. The child is re-mounted on mode
// change (via key) so any internal state resets — matching
// what a user expects from flipping the toggle.

const MODE_TONE: Record<ValidationMode, Tone> = { trust: 'idle', recover: 'accent', strict: 'bad' };

const TONE_INK: Record<Tone, { fg: string; bg: string; border: string }> = {
  idle: { fg: INK.soft, bg: INK.wash, border: INK.line },
  accent: { fg: INK.accent, bg: INK.accentWash, border: '#c7d2fe' },
  bad: { fg: INK.bad, bg: INK.badWash, border: '#fecaca' },
  ok: { fg: INK.ok, bg: INK.okWash, border: '#a7f3d0' },
  warn: { fg: INK.warn, bg: INK.warnWash, border: '#fde68a' },
};

const MODE_DESCRIPTION: Record<ValidationMode, string> = {
  trust:
    'No validation. Every chunk is applied as-is — the stream reflects exactly what the model emitted. Debug only; a hallucinated field can break your UI.',
  recover:
    'Validate each chunk. On a bad value, refuse it, keep the last good value for that field, report it, keep streaming. The default.',
  strict:
    'Validate each chunk. On the first violation, stop the stream, freeze what is on screen, report once, and reject final(). Use when partly-wrong data is worse than none.',
};

type Props = {
  initial?: ValidationMode;
  children: (mode: ValidationMode) => ReactNode;
};

export const ModeSwitcher: FC<Props> = ({ initial = 'recover', children }) => {
  const [mode, setMode] = useState<ValidationMode>(initial);
  const ink = TONE_INK[MODE_TONE[mode]];
  return (
    <>
      <div style={{ maxWidth: 960, margin: '16px auto 0', padding: '0 24px' }}>
        <div style={{ border: `1px solid ${INK.line}`, borderRadius: 14, background: '#ffffff', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 650, color: INK.text, marginRight: 4 }}>When the model sends garbage</span>
            {(['trust', 'recover', 'strict'] as const).map((key) => {
              const on = mode === key;
              const t = TONE_INK[MODE_TONE[key]];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMode(key)}
                  style={{
                    font: 'inherit',
                    fontFamily: MONO,
                    fontSize: 12,
                    fontWeight: 650,
                    padding: '3px 12px',
                    borderRadius: 999,
                    cursor: 'pointer',
                    border: `1px solid ${on ? t.border : INK.line}`,
                    background: on ? t.bg : '#ffffff',
                    color: on ? t.fg : INK.faint,
                  }}
                >
                  {key}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 12.5, lineHeight: 1.55, color: INK.soft }}>
            <span style={{ fontFamily: MONO, fontWeight: 650, color: ink.fg }}>{mode}</span> — {MODE_DESCRIPTION[mode]}
          </div>
        </div>
      </div>
      <div key={mode}>{children(mode)}</div>
    </>
  );
};
