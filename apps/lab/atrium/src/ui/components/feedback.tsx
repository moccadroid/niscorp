import { z } from 'zod';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { SIZE } from '../lib/tokens';
import { Icon } from './display';

const SkeletonProps = z.object({ h: z.number().optional(), w: z.union([z.number(), z.string()]).optional(), count: z.number().optional() }).strict();

export const Skeleton: NovaComponent<z.infer<typeof SkeletonProps>> = ({ h = 18, w = '100%', count = 1 }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className="at-skeleton" style={{ height: h, width: w }} />
    ))}
  </div>
);
Skeleton.meta = { description: 'A shimmering placeholder. Loading is explicit data, never Suspense.', propsSchema: SkeletonProps };

const EmptyProps = z.object({ icon: z.string().optional(), title: z.string().optional(), hint: z.string().optional() }).strict();

export const Empty: NovaComponent<z.infer<typeof EmptyProps>> = ({ icon = 'dot', title, hint }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '52px 20px', textAlign: 'center' }}>
    <Icon name={icon} size={26} color="faint" />
    {title !== undefined ? <span style={{ fontFamily: 'var(--serif)', fontSize: SIZE['lg'] }}>{title}</span> : null}
    {hint !== undefined ? <span style={{ color: 'var(--ink-faint)', fontSize: SIZE['sm'], maxWidth: 320 }}>{hint}</span> : null}
  </div>
);
Empty.meta = { description: 'The nothing-here state.', propsSchema: EmptyProps };

const SpinnerProps = z.object({ size: z.number().optional() }).strict();

export const Spinner: NovaComponent<z.infer<typeof SpinnerProps>> = ({ size = 16 }) => (
  <span style={{ width: size, height: size, border: '2px solid var(--line)', borderTopColor: 'var(--accent)', borderRadius: 999, display: 'inline-block', animation: 'at-spin .7s linear infinite' }}>
    <style>{'@keyframes at-spin{to{transform:rotate(360deg)}}'}</style>
  </span>
);
Spinner.meta = { description: 'An inline activity mark.', propsSchema: SpinnerProps };
