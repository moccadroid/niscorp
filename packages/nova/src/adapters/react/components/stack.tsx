import type { CSSProperties } from 'react';
import { z } from 'zod';
import type { NovaComponent, NovaComponentProps } from '@react';

// ═══════════════════════════════════════════════════════════
// Stack — flex container
// ═══════════════════════════════════════════════════════════

export const StackPropsSchema = z
  .object({
    direction: z
      .enum(['row', 'column'])
      .optional()
      .describe('Flex direction. Default: column.'),
    gap: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Gap between children in pixels. Default: 0.'),
    align: z
      .enum(['start', 'center', 'end', 'stretch'])
      .optional()
      .describe('Cross-axis alignment. Default: stretch.'),
    justify: z
      .enum(['start', 'center', 'end', 'between', 'around'])
      .optional()
      .describe('Main-axis justification. Default: start.'),
    padding: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Inner padding in pixels. Default: 0.'),
    wrap: z
      .boolean()
      .optional()
      .describe('Whether children wrap to a new line. Default: false.'),
  })
  .strict()
  .describe('Flex container that arranges children in a row or column.');

export type StackProps = z.infer<typeof StackPropsSchema>;

const ALIGN_MAP = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
} as const;

const JUSTIFY_MAP = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
  around: 'space-around',
} as const;

export const Stack: NovaComponent<StackProps> = ({
  direction,
  gap,
  align,
  justify,
  padding,
  wrap,
  children,
}: NovaComponentProps & StackProps) => {
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: direction ?? 'column',
    gap: gap ?? 0,
    alignItems: ALIGN_MAP[align ?? 'stretch'],
    justifyContent: JUSTIFY_MAP[justify ?? 'start'],
    padding: padding ?? 0,
    flexWrap: wrap === true ? 'wrap' : 'nowrap',
  };
  return <div style={style}>{children}</div>;
};

Stack.meta = {
  description: 'Flex container that arranges children in a row or column.',
  propsSchema: StackPropsSchema,
};
