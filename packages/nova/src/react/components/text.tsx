import { createElement, type CSSProperties } from 'react';
import { z } from 'zod';
import type { NovaComponent, NovaComponentProps } from '@react';

// ═══════════════════════════════════════════════════════════
// Text — typography element
// ═══════════════════════════════════════════════════════════

export const TextPropsSchema = z
  .object({
    as: z
      .enum(['span', 'p', 'h1', 'h2', 'h3', 'h4'])
      .optional()
      .describe('HTML element to render. Default: span.'),
    size: z
      .enum(['sm', 'md', 'lg', 'xl', '2xl'])
      .optional()
      .describe('Font size token. Default: md.'),
    weight: z
      .enum(['normal', 'medium', 'bold'])
      .optional()
      .describe('Font weight token. Default: normal.'),
    color: z
      .string()
      .optional()
      .describe('CSS color string (open set). Default: inherit.'),
  })
  .strict()
  .describe('Text element with semantic typography props.');

export type TextProps = z.infer<typeof TextPropsSchema>;

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
