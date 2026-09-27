import type { FC, ReactNode } from 'react';
import { PhoneFrame, type PhoneTone } from '@showroom/chrome/stage/phone';

// ═══════════════════════════════════════════════════════════
// The devices nova's stories render on.
//
// A layout is a screen, so every nova story is drawn on one: the stage's phone
// for most, and a tablet — the same bezel, wider — for the few whose point is
// several canvases side by side (a kanban, a dashboard, a list beside a
// detail). Both are plain frames; what is inside is the real nova renderer.
// ═══════════════════════════════════════════════════════════

const RING: Record<PhoneTone, string> = { ok: '#10b981', bad: '#ef4444', plain: '#e5e7eb', accent: '#6366f1' };

// PhoneFrame's wide sibling. Same bezel, same status bar, same screen colour —
// only the width and the corner radius change, so the two read as one family.
export const TabletFrame: FC<{ tone?: PhoneTone; width?: number; status?: ReactNode; minHeight?: number; children: ReactNode }> = ({
  tone = 'plain',
  width = 780,
  status,
  minHeight = 380,
  children,
}) => (
  <div
    className="stage-phone"
    style={{
      width,
      maxWidth: '100%',
      borderRadius: 26,
      padding: 12,
      background: '#111827',
      boxShadow: `0 0 0 3px ${RING[tone]}, 0 22px 48px -20px rgba(17,24,39,0.45)`,
      transition: 'box-shadow 200ms',
      boxSizing: 'border-box',
    }}
  >
    <div style={{ borderRadius: 16, background: '#f6f7f9', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 18px 4px', fontSize: 10.5, fontWeight: 600, color: '#374151' }}>
        <span>9:41</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{status}</span>
      </div>
      <div style={{ padding: '10px 16px 20px', minHeight }}>{children}</div>
    </div>
  </div>
);

export type DeviceSize = 'phone' | 'tablet';

// One entry point for both. The inner box is `position: relative` so a story
// that draws an overlay (the modal) is scoped to the screen, and scrolls
// sideways rather than spilling out of the bezel if a layout is wider than it.
export const Device: FC<{ size?: DeviceSize; tone?: PhoneTone; status?: ReactNode; minHeight?: number; children: ReactNode }> = ({
  size = 'phone',
  tone = 'plain',
  status,
  minHeight,
  children,
}) => {
  const screen = <div style={{ position: 'relative', overflowX: 'auto', minWidth: 0 }}>{children}</div>;
  return size === 'tablet' ? (
    <TabletFrame tone={tone} status={status} {...(minHeight === undefined ? {} : { minHeight })}>
      {screen}
    </TabletFrame>
  ) : (
    <PhoneFrame tone={tone} width={340} status={status} minHeight={minHeight ?? 420}>
      {screen}
    </PhoneFrame>
  );
};
