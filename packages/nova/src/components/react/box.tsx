import type { CSSProperties } from 'react';
import { z } from 'zod';
import type { NovaComponent, NovaComponentProps } from '@react';

// ═══════════════════════════════════════════════════════════
// Box — generic styled container
// ═══════════════════════════════════════════════════════════

export const BoxPropsSchema = z
  .object({
    padding: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Inner padding in pixels. Default: 0.'),
    background: z
      .string()
      .optional()
      .describe('CSS background color or value.'),
    border: z
      .boolean()
      .optional()
      .describe('Whether to show a 1px border. Default: false.'),
    radius: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Border radius in pixels. Default: 0.'),
  })
  .strict()
  .describe('Generic container with basic styling props. Use Stack for layout, Box for visual wrapping.');

export type BoxProps = z.infer<typeof BoxPropsSchema>;

export const Box: NovaComponent<BoxProps> = ({
  padding,
  background,
  border,
  radius,
  children,
}: NovaComponentProps & BoxProps) => {
  const style: CSSProperties = {
    padding: padding ?? 0,
    background: background ?? 'transparent',
    border: border === true ? '1px solid #e5e7eb' : 'none',
    borderRadius: radius ?? 0,
  };
  return <div style={style}>{children}</div>;
};

Box.meta = {
  description: 'Generic container with basic styling props. Use Stack for layout, Box for visual wrapping.',
  propsSchema: BoxPropsSchema,
};
