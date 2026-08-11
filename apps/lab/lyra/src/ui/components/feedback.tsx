import { z } from 'zod';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { COLOR, SIZE, WEIGHT } from '../lib/tokens';
import { Icon } from './display';

// Loading and nothing-here. Both are explicit data in this stack — `loading:
// true` is a key in the action's data, never a Suspense boundary — so these
// render a fact rather than intercept one.

const SkeletonProps = z.object({ lines: z.number().optional(), height: z.number().optional(), width: z.union([z.number(), z.string()]).optional() }).strict();

export const Skeleton: NovaComponent<z.infer<typeof SkeletonProps>> = ({ lines, height, width }: z.infer<typeof SkeletonProps>) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
    {Array.from({ length: lines ?? 3 }, (_unused, i) => (
      <div key={i} className="ly-skeleton" style={{ height: height ?? 14, width: width ?? (i === (lines ?? 3) - 1 ? '60%' : '100%') }} />
    ))}
  </div>
);
Skeleton.meta = { description: 'Placeholder bars while a read is in flight.', propsSchema: SkeletonProps };

// AN EMPTY STATE IS A DRAWING AND A SENTENCE. This took `children` and no
// screen in the app ever passed any, so every "nothing here" in the product
// was two lines of grey text in the middle of a white box — the moment a
// person is most likely to think the thing is broken. A muted glyph costs
// nothing and says "this is a state, not a failure".
const EmptyProps = z.object({ title: z.string(), hint: z.string().optional(), icon: z.string().optional() }).strict();
type EmptyP = Partial<z.infer<typeof EmptyProps>> & { children?: React.ReactNode };

export const Empty: NovaComponent<Partial<z.infer<typeof EmptyProps>>> = ({ title, hint, icon, children }: EmptyP) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, padding: '38px 20px', textAlign: 'center' }}>
    {icon === undefined ? null : (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: 'var(--surface-sunk)',
          color: 'var(--ink-faint)',
          marginBottom: 2,
        }}
      >
        <Icon name={icon} size={21} />
      </span>
    )}
    <span style={{ fontSize: SIZE['md'], fontWeight: WEIGHT['medium'], color: COLOR['soft'] }}>{title}</span>
    {hint === undefined ? null : <span style={{ fontSize: SIZE['sm'], color: COLOR['mute'], maxWidth: 320, lineHeight: 1.55 }}>{hint}</span>}
    {children}
  </div>
);
Empty.meta = { description: 'Nothing here, and what to do about it. An empty state without a next step is a dead end.', propsSchema: EmptyProps };

const SpinnerProps = z.object({ size: z.number().optional() }).strict();
export const Spinner: NovaComponent<z.infer<typeof SpinnerProps>> = ({ size }: z.infer<typeof SpinnerProps>) => (
  <span
    aria-label="Working"
    role="status"
    style={{
      display: 'inline-block',
      width: size ?? 15,
      height: size ?? 15,
      border: '2px solid var(--line-strong)',
      borderTopColor: 'var(--ink)',
      borderRadius: '50%',
      animation: 'ly-spin 0.6s linear infinite',
    }}
  />
);
Spinner.meta = { description: 'A small busy indicator, for inside a button.', propsSchema: SpinnerProps };
