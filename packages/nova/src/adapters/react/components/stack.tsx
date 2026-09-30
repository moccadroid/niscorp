import type { CSSProperties } from 'react';
import { StackPropsSchema, type StackProps } from '../../primitive-props';
import type { NovaComponent, NovaComponentProps } from '@react';

// ═══════════════════════════════════════════════════════════
// Stack — flex container
// ═══════════════════════════════════════════════════════════

export { StackPropsSchema, type StackProps };

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
