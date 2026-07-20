import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import type { NovaComponent } from '@niscorp/nova/adapters/react';

// ═══════════════════════════════════════════════════════════
// Confetti — replays a full-viewport pastel burst every time
// the `spark` prop changes to a new non-zero value. Pure
// presentation: the burst geometry is deterministic per piece,
// no timers, no cleanup — pieces end at opacity 0 and are
// replaced wholesale (new keys) on the next burst.
// ═══════════════════════════════════════════════════════════

const ConfettiPropsSchema = z
  .object({
    spark: z.number().optional().describe('Burst trigger: each new non-zero value replays the burst.'),
  })
  .strict()
  .describe('Full-viewport confetti burst, replayed on spark changes.');

type ConfettiProps = z.infer<typeof ConfettiPropsSchema>;

const COLORS = ['#f4a7b9', '#f2cf5b', '#8fd0a5', '#a9c1ec', '#d8b4e2', '#f5a973'];

// Golden-angle spread: deterministic, but no two pieces alike.
const PIECES = Array.from({ length: 22 }, (_, i) => {
  const angle = (i * 137.5 * Math.PI) / 180;
  const distance = 90 + ((i * 53) % 160);
  return {
    x: Math.cos(angle) * distance,
    y: Math.abs(Math.sin(angle)) * distance * 0.7 + 120,
    r: ((i * 197) % 520) - 260,
    delay: (i % 5) * 35,
    color: COLORS[i % COLORS.length] ?? '#f4a7b9',
    round: i % 3 === 0,
  };
});

export const Confetti: NovaComponent<ConfettiProps> = ({ spark }) => {
  const [burst, setBurst] = useState(0);
  const previous = useRef(spark ?? 0);

  useEffect(() => {
    const current = spark ?? 0;
    if (current !== previous.current) {
      previous.current = current;
      if (current > 0) setBurst((b) => b + 1);
    }
  }, [spark]);

  if (burst === 0) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 60 }}>
      {PIECES.map((piece, i) => (
        <span
          key={`${burst}-${i}`}
          style={{
            position: 'absolute',
            left: '50%',
            top: '22%',
            width: 8,
            height: piece.round ? 8 : 13,
            background: piece.color,
            borderRadius: piece.round ? 999 : 3,
            opacity: 0,
            '--cx': `${piece.x}px`,
            '--cy': `${piece.y}px`,
            '--cr': `${piece.r}deg`,
            animation: `m-confetti 900ms cubic-bezier(0.15, 0.6, 0.4, 1) ${piece.delay}ms forwards`,
          }}
        />
      ))}
    </div>
  );
};

Confetti.meta = { description: 'Full-viewport confetti burst, replayed on spark changes.', propsSchema: ConfettiPropsSchema };
