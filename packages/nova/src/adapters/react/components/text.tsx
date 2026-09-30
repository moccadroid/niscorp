import { createElement, type CSSProperties } from 'react';
import { TextPropsSchema, type TextProps } from '../../primitive-props';
import type { NovaComponent, NovaComponentProps } from '@react';

// ═══════════════════════════════════════════════════════════
// Text — typography element
// ═══════════════════════════════════════════════════════════

export { TextPropsSchema, type TextProps };

const SIZE_MAP = {
  sm: '12px',
  md: '14px',
  lg: '16px',
  xl: '20px',
  '2xl': '24px',
} as const;

const WEIGHT_MAP = {
  normal: 400,
  medium: 500,
  bold: 700,
} as const;

export const Text: NovaComponent<TextProps> = ({
  as,
  size,
  weight,
  color,
  children,
}: NovaComponentProps & TextProps) => {
  const tag = as ?? 'span';
  const style: CSSProperties = {
    fontSize: SIZE_MAP[size ?? 'md'],
    fontWeight: WEIGHT_MAP[weight ?? 'normal'],
    color: color ?? 'inherit',
  };
  return createElement(tag, { style }, children);
};

Text.meta = {
  description: 'Text element with semantic typography props.',
  propsSchema: TextPropsSchema,
};
