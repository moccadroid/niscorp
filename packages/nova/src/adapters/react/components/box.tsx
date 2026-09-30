import type { CSSProperties } from 'react';
import { BoxPropsSchema, type BoxProps } from '../../primitive-props';
import type { NovaComponent, NovaComponentProps } from '@react';

// ═══════════════════════════════════════════════════════════
// Box — generic styled container
// ═══════════════════════════════════════════════════════════

export { BoxPropsSchema, type BoxProps };

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
