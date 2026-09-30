import { defineComponent, h } from 'vue';
import {
  BoxPropsSchema,
  StackPropsSchema,
  TextPropsSchema,
  type BoxProps,
  type StackProps,
  type TextProps,
} from '../../primitive-props';

// ═══════════════════════════════════════════════════════════
// The layout primitives — Stack, Box, Text. Headless reference looks (inline
// styles, as the React kit's); an app's kit is where its real look lives.
// ═══════════════════════════════════════════════════════════

export { StackPropsSchema, type StackProps, BoxPropsSchema, type BoxProps, TextPropsSchema, type TextProps };

const px = (value: number | undefined): string => `${value ?? 0}px`;

// ─── Stack ─────────────────────────────────────────────────

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

export const Stack = Object.assign(
  defineComponent(
    (props: StackProps, { slots }) =>
      () =>
        h(
          'div',
          {
            style: {
              display: 'flex',
              flexDirection: props.direction ?? 'column',
              gap: px(props.gap),
              alignItems: ALIGN_MAP[props.align ?? 'stretch'],
              justifyContent: JUSTIFY_MAP[props.justify ?? 'start'],
              padding: px(props.padding),
              flexWrap: props.wrap === true ? 'wrap' : 'nowrap',
            },
          },
          slots.default?.(),
        ),
    { name: 'NovaStack', props: ['direction', 'gap', 'align', 'justify', 'padding', 'wrap'], inheritAttrs: false },
  ),
  { meta: { description: 'Flex container that arranges children in a row or column.', propsSchema: StackPropsSchema } },
);

// ─── Box ───────────────────────────────────────────────────

export const Box = Object.assign(
  defineComponent(
    (props: BoxProps, { slots }) =>
      () =>
        h(
          'div',
          {
            style: {
              padding: px(props.padding),
              background: props.background ?? 'transparent',
              border: props.border === true ? '1px solid #e5e7eb' : 'none',
              borderRadius: px(props.radius),
            },
          },
          slots.default?.(),
        ),
    { name: 'NovaBox', props: ['padding', 'background', 'border', 'radius'], inheritAttrs: false },
  ),
  {
    meta: {
      description: 'Generic container with basic styling props. Use Stack for layout, Box for visual wrapping.',
      propsSchema: BoxPropsSchema,
    },
  },
);

// ─── Text ──────────────────────────────────────────────────

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

export const Text = Object.assign(
  defineComponent(
    (props: TextProps, { slots }) =>
      () =>
        h(
          props.as ?? 'span',
          {
            style: {
              fontSize: SIZE_MAP[props.size ?? 'md'],
              fontWeight: WEIGHT_MAP[props.weight ?? 'normal'],
              color: props.color ?? 'inherit',
            },
          },
          slots.default?.(),
        ),
    { name: 'NovaText', props: ['as', 'size', 'weight', 'color'], inheritAttrs: false },
  ),
  { meta: { description: 'Text element with semantic typography props.', propsSchema: TextPropsSchema } },
);
