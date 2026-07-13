import { z } from 'zod';
import type { NovaComponent } from '@niscorp/nova/react';

// ─── Skeleton ──────────────────────────────────────────────
const SkeletonProps = z
  .object({ width: z.union([z.number(), z.string()]).optional(), height: z.number().optional() })
  .strict();

export const Skeleton: NovaComponent<z.infer<typeof SkeletonProps>> = ({ width, height = 14 }) => (
  <span className="fb-skel" style={{ display: 'block', width: width ?? '100%', height }} />
);
Skeleton.meta = {
  description: 'Shimmering placeholder bar for loading states.',
  propsSchema: SkeletonProps,
};
