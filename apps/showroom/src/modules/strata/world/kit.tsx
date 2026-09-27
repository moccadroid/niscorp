import type { FC, ReactNode } from 'react';
import type { LayoutNode } from '@niscorp/nova';
import { Nova, type NovaComponent } from '@niscorp/nova/adapters/react';
import { PhoneFrame, PhoneStyles, type PhoneTone } from '@showroom/chrome/stage/phone';
import { RELEASES } from './acme';

// ═══════════════════════════════════════════════════════════
// Acme's component kit, release by release — the renderer each release ships.
//
// Components are configured, never styled, and an unknown prop is ignored:
// exactly the nisc rule, and exactly why an old document drawn by a new kit
// breaks QUIETLY. A `label` the kit no longer reads is not an error — it is a
// blank button. That quiet is what strata exists to prevent.
// ═══════════════════════════════════════════════════════════

type Kids = { children?: ReactNode };
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

const Stack: NovaComponent = ({ children, gap }: Kids & { gap?: unknown }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: gap === 'tight' ? 2 : 10, minWidth: 0 }}>{children}</div>
);

const Text: NovaComponent = ({ children, size, tone }: Kids & { size?: unknown; tone?: unknown }) => (
  <div
    style={{
      fontSize: size === 'title' ? 20 : tone === 'muted' ? 11.5 : 13.5,
      fontWeight: size === 'title' ? 700 : tone === 'muted' ? 400 : 600,
      color: tone === 'muted' ? '#6b7280' : '#111827',
      letterSpacing: size === 'title' ? -0.3 : 0,
    }}
  >
    {children}
  </div>
);

const Input: NovaComponent = ({ placeholder }: { placeholder?: unknown }) => (
  <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: '#9ca3af', background: '#f9fafb' }}>
    ⌕ {str(placeholder) ?? ''}
  </div>
);

const pill = (filled: boolean) => ({
  font: 'inherit',
  minWidth: 64,
  minHeight: 30,
  padding: '6px 14px',
  borderRadius: 999,
  fontSize: 12.5,
  fontWeight: 600,
  cursor: 'default',
  border: filled ? '1px solid #4f46e5' : '1px solid #d1d5db',
  background: filled ? '#4f46e5' : '#ffffff',
  color: filled ? '#ffffff' : '#111827',
  alignSelf: 'flex-start',
});

// The one component every release changes. Release 0 reads `label` and `tone`;
// 1 reads `text` and `tone`; 2 and on read `text` and `variant`.
const buttonFor = (release: number): NovaComponent => {
  const ButtonAt: NovaComponent = (props: Record<string, unknown>) => {
    const words = str(release >= 1 ? props['text'] : props['label']);
    const filled = release >= 2 ? props['variant'] === 'filled' : props['tone'] === 'primary';
    return (
      <button type="button" style={pill(filled)}>
        {words ?? ''}
      </button>
    );
  };
  return ButtonAt;
};

const Box: NovaComponent = ({ children }: Kids) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      padding: '12px 14px',
      borderRadius: 12,
      border: '1px solid #eef0f3',
      background: '#ffffff',
      boxShadow: '0 1px 2px rgba(17,24,39,0.05)',
    }}
  >
    {children}
  </div>
);

// Release 3 renamed Card to Tile: the kit before it knows only Card, the kit
// after it only Tile. Same look — the name is the whole change.
const kitAt = (release: number): Record<string, NovaComponent> => ({
  Stack,
  Text,
  Input,
  Button: buttonFor(release),
  ...(release >= 3 ? { Tile: Box } : { Card: Box }),
});

const kits = new Map<number, Record<string, NovaComponent>>();
const kitFor = (release: number): Record<string, NovaComponent> => {
  const known = kits.get(release);
  if (known !== undefined) return known;
  const made = kitAt(release);
  kits.set(release, made);
  return made;
};

const isLayout = (v: unknown): v is LayoutNode => typeof v === 'object' && v !== null && !Array.isArray(v);

// A phone showing one action document, drawn by one release's kit.
export const Phone: FC<{
  document: Record<string, unknown>;
  release: number;
  tone?: PhoneTone;
  width?: number;
}> = ({ document, release, tone = 'plain', width = 300 }) => {
  const layout = document['layout'];
  const data = document['data'];
  return (
    <PhoneFrame tone={tone} width={width} status={`Acme Studio · kit ${RELEASES[release]?.name ?? ''}`}>
      {isLayout(layout) ? (
        <Nova.Layout
          key={release}
          layout={layout}
          data={typeof data === 'object' && data !== null && !Array.isArray(data) ? Object.fromEntries(Object.entries(data)) : {}}
          builtins={false}
          components={kitFor(release)}
        />
      ) : null}
    </PhoneFrame>
  );
};

export { PhoneStyles };
