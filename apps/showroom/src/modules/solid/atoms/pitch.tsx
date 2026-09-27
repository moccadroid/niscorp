import type { FC } from 'react';
import { INK } from '@showroom/chrome/stage/ui';

// ═══════════════════════════════════════════════════════════
// Pitch — the "why this matters" head of every solid story, in the stage's
// language: an eyebrow, a sentence a non-expert can read, and the reason.
// Solid's own copy of the shared chrome pitch, so the module reads like the
// charter and strata pages around it.
// ═══════════════════════════════════════════════════════════

export const Pitch: FC<{ headline: string; body: string }> = ({ headline, body }) => (
  <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 24px 4px', display: 'flex', flexDirection: 'column', gap: 8, color: INK.text }}>
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: INK.accent }}>Why this matters</div>
    <div style={{ fontSize: 22, fontWeight: 750, letterSpacing: -0.4, lineHeight: 1.2 }}>{headline}</div>
    <div style={{ fontSize: 14, lineHeight: 1.6, color: INK.soft, maxWidth: 820 }}>{body}</div>
  </div>
);
