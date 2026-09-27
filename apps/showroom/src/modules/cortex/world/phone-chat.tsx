import { useState, type FC } from 'react';
import { PhoneFrame, type PhoneTone } from '@showroom/chrome/stage/phone';
import { INK } from '@showroom/chrome/stage/ui';

// ═══════════════════════════════════════════════════════════
// A chat inside a phone — the member's side of a cortex agent.
// Bubbles, a "typing…" state, one-tap prompts and a text box.
// ═══════════════════════════════════════════════════════════

export type ChatLine = { from: 'me' | 'them' | 'note'; text: string };

export const PhoneChat: FC<{
  who: string;
  title: string;
  lines: readonly ChatLine[];
  busy: boolean;
  prompts: readonly string[];
  onSend: (text: string) => void;
  tone?: PhoneTone;
  width?: number;
}> = ({ who, title, lines, busy, prompts, onSend, tone = 'accent', width = 300 }) => {
  const [draft, setDraft] = useState('');
  const send = (text: string): void => {
    if (busy || text.trim() === '') return;
    onSend(text.trim());
    setDraft('');
  };
  return (
    <PhoneFrame tone={tone} width={width} status={`${who} · Acme Studio`} minHeight={440}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: 440 }}>
        <div style={{ fontSize: 16, fontWeight: 750, letterSpacing: -0.3 }}>{title}</div>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 2 }}>
          {lines.length === 0 && <div style={{ fontSize: 12, color: INK.faint }}>Tap a question below, or type one.</div>}
          {lines.map((l, i) =>
            l.from === 'note' ? (
              <div key={i} style={{ alignSelf: 'center', fontSize: 10.5, color: INK.faint, fontStyle: 'italic' }}>
                {l.text}
              </div>
            ) : (
              <div
                key={i}
                style={{
                  alignSelf: l.from === 'me' ? 'flex-end' : 'flex-start',
                  maxWidth: '86%',
                  padding: '7px 11px',
                  borderRadius: 14,
                  fontSize: 12.5,
                  lineHeight: 1.45,
                  whiteSpace: 'pre-wrap',
                  background: l.from === 'me' ? INK.accent : '#ffffff',
                  color: l.from === 'me' ? '#ffffff' : INK.text,
                  border: l.from === 'me' ? 'none' : '1px solid #eef0f3',
                }}
              >
                {l.text}
              </div>
            ),
          )}
          {busy && <div style={{ alignSelf: 'flex-start', fontSize: 12, color: INK.faint, padding: '4px 10px' }}>typing…</div>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {prompts.map((p) => (
            <button
              key={p}
              type="button"
              disabled={busy}
              onClick={() => send(p)}
              style={{ font: 'inherit', fontSize: 11, padding: '3px 8px', borderRadius: 999, border: '1px solid #c7d2fe', background: '#eef2ff', color: INK.accent, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1 }}
            >
              {p}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={draft}
            disabled={busy}
            placeholder="Message…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send(draft);
            }}
            style={{ font: 'inherit', fontSize: 12.5, flex: 1, minWidth: 0, padding: '7px 10px', borderRadius: 999, border: '1px solid #e5e7eb', background: '#fff' }}
          />
          <button
            type="button"
            disabled={busy || draft.trim() === ''}
            onClick={() => send(draft)}
            style={{ font: 'inherit', fontSize: 12, fontWeight: 650, padding: '6px 12px', borderRadius: 999, border: 'none', background: INK.accent, color: '#fff', opacity: busy || draft.trim() === '' ? 0.4 : 1, cursor: 'pointer' }}
          >
            Send
          </button>
        </div>
      </div>
    </PhoneFrame>
  );
};
