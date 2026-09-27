import type { FC, ReactNode } from 'react';
import { PhoneFrame, type PhoneTone } from '@showroom/chrome/stage/phone';
import { Btn, INK } from '@showroom/chrome/stage/ui';
import { stamp } from '../world/ledger';

// ═══════════════════════════════════════════════════════════
// A member's phone, as a list of what arrived on it — newest on top, the
// newest one tinted so a click shows where it landed. Plus the small
// "do something" button every page uses, which always says why it can't.
// ═══════════════════════════════════════════════════════════

export type Note = { at: number; icon: string; title: string; body?: string; tone?: 'plain' | 'bad' | 'warn'; key: string };

export const Messages: FC<{ who: string; status?: string; notes: readonly Note[]; tone?: PhoneTone; width?: number; minHeight?: number; empty?: string; fresh?: ReadonlySet<string> }> = ({
  who,
  status,
  notes,
  tone = 'plain',
  width = 230,
  minHeight = 240,
  empty = 'Nothing yet.',
  fresh,
}) => {
  const sorted = [...notes].sort((a, b) => b.at - a.at);
  return (
    <PhoneFrame tone={tone} width={width} status={status ?? who} minHeight={minHeight}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 16, fontWeight: 750, letterSpacing: -0.3 }}>{who}</div>
        {sorted.length === 0 && <div style={{ fontSize: 12, color: INK.faint }}>{empty}</div>}
        {sorted.map((n) => {
          const isNew = fresh?.has(n.key) === true;
          const bad = n.tone === 'bad';
          const warn = n.tone === 'warn';
          return (
            <div
              key={n.key}
              style={{
                background: bad ? '#fef2f2' : warn ? '#fffbeb' : isNew ? INK.accentWash : '#fff',
                border: `1px solid ${bad ? '#fecaca' : warn ? '#fde68a' : isNew ? '#c7d2fe' : '#eef0f3'}`,
                borderRadius: 10,
                padding: '6px 9px',
                transition: 'background 300ms',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 10.5, color: INK.faint }}>
                <span style={{ fontWeight: 700, color: INK.text }}>
                  {n.icon} Acme Studio
                </span>
                <span>{stamp(n.at)}</span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.35 }}>{n.title}</div>
              {n.body !== undefined && <div style={{ fontSize: 11, color: bad ? INK.bad : INK.soft, lineHeight: 1.35 }}>{n.body}</div>}
            </div>
          );
        })}
      </div>
    </PhoneFrame>
  );
};

// A button with its caption under it: what it does, or — when it can't —
// why not. No button on these pages does nothing silently.
export const Act: FC<{ label: ReactNode; onClick: () => void; why?: string; hint?: string; primary?: boolean; busy?: boolean }> = ({ label, onClick, why, hint, primary = false, busy = false }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 220 }}>
    <Btn kind={primary ? 'primary' : 'plain'} disabled={why !== undefined || busy} onClick={onClick} title={why ?? hint}>
      {label}
    </Btn>
    <div style={{ fontSize: 11.5, lineHeight: 1.35, color: why === undefined ? INK.faint : INK.warn, minHeight: 15 }}>{why ?? hint ?? ''}</div>
  </div>
);
