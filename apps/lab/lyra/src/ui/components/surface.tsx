import { z } from 'zod';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { COLOR, SIZE, TONE, WEIGHT, toneToken } from '../lib/tokens';
import { displayText } from '../lib/display';

// The things that hold other things and say something by doing so.

const CardProps = z.object({ pad: z.number().optional(), tone: toneToken, raised: z.boolean().optional(), flush: z.boolean().optional() }).strict();
type CardP = z.infer<typeof CardProps> & { children?: React.ReactNode };

export const Card: NovaComponent<z.infer<typeof CardProps>> = ({ pad, tone, raised, flush, children }: CardP) => (
  <div
    style={{
      background: tone === undefined ? 'var(--surface)' : TONE[tone]?.bg,
      border: '1px solid var(--line)',
      borderRadius: 'var(--radius-lg)',
      padding: flush === true ? 0 : (pad ?? 18),
      ...(raised === true ? { boxShadow: 'var(--shadow-md)' } : {}),
      ...(flush === true ? { overflow: 'hidden' } : {}),
    }}
  >
    {children}
  </div>
);
Card.meta = { description: 'A bordered panel. `flush` removes the padding so a list can run edge to edge inside it.', propsSchema: CardProps };

const SectionProps = z.object({ title: z.string().optional(), subtitle: z.string().optional(), gap: z.number().optional() }).strict();
type SectionP = z.infer<typeof SectionProps> & { children?: React.ReactNode };

export const Section: NovaComponent<z.infer<typeof SectionProps>> = ({ title, subtitle, gap, children }: SectionP) => (
  <section style={{ display: 'flex', flexDirection: 'column', gap: gap ?? 12, width: '100%' }}>
    {title === undefined && subtitle === undefined ? null : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {title === undefined ? null : <h2 style={{ margin: 0, fontSize: SIZE['lg'], fontWeight: WEIGHT['semi'], letterSpacing: '-0.01em' }}>{title}</h2>}
        {subtitle === undefined ? null : <span style={{ fontSize: SIZE['sm'], color: COLOR['mute'] }}>{subtitle}</span>}
      </div>
    )}
    {children}
  </section>
);
Section.meta = { description: 'A titled block. The heading level is the kit’s decision, not the layout’s.', propsSchema: SectionProps };

const HeroProps = z.object({ title: z.string(), lead: z.string().optional(), eyebrow: z.string().optional() }).strict();
type HeroP = Partial<z.infer<typeof HeroProps>> & { children?: React.ReactNode };

export const Hero: NovaComponent<Partial<z.infer<typeof HeroProps>>> = ({ title, lead, eyebrow, children }: HeroP) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
    {eyebrow === undefined ? null : (
      <span style={{ fontSize: SIZE['xs'], fontWeight: WEIGHT['semi'], color: COLOR['mute'], textTransform: 'uppercase', letterSpacing: '0.08em' }}>{displayText(eyebrow)}</span>
    )}
    <h1 style={{ margin: 0, fontSize: SIZE['xxl'], fontWeight: WEIGHT['bold'], letterSpacing: '-0.03em', lineHeight: 1.1 }}>{displayText(title)}</h1>
    {lead === undefined ? null : <p style={{ margin: 0, fontSize: SIZE['lg'], color: COLOR['mute'], maxWidth: 560 }}>{displayText(lead)}</p>}
    {children}
  </div>
);
Hero.meta = { description: 'The top of a page: eyebrow, title, lead.', propsSchema: HeroProps };

const NoticeProps = z.object({ tone: toneToken, title: z.string().optional(), message: z.string() }).strict();

export const Notice: NovaComponent<Partial<z.infer<typeof NoticeProps>>> = ({ tone, title, message }: Partial<z.infer<typeof NoticeProps>>) => {
  const t = TONE[tone ?? 'neutral'] ?? TONE['neutral'];
  return (
    <div role={tone === 'alert' ? 'alert' : undefined} style={{ display: 'flex', flexDirection: 'column', gap: 3, background: t?.bg, color: t?.fg, padding: '11px 14px', borderRadius: 'var(--radius-md)', width: '100%' }}>
      {title === undefined ? null : <span style={{ fontWeight: WEIGHT['semi'], fontSize: SIZE['sm'] }}>{displayText(title)}</span>}
      <span style={{ fontSize: SIZE['sm'] }}>{displayText(message)}</span>
    </div>
  );
};
Notice.meta = { description: 'A message about what just happened. `alert` announces itself to a screen reader.', propsSchema: NoticeProps };
