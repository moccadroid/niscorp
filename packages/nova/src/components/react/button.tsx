import { useState, type CSSProperties, type MouseEvent } from 'react';
import { z } from 'zod';
import { useNovaDispatch, type NovaComponent, type NovaComponentProps } from '@react';

// ═══════════════════════════════════════════════════════════
// Button — clickable element
//
// Click events fire as `ui:click` carrying the layout node's
// `ref` (injected as `novaRef`). Without a ref, clicks are no-ops.
// ═══════════════════════════════════════════════════════════

export const ButtonPropsSchema = z
  .object({
    label: z
      .string()
      .optional()
      .describe('Button label. If absent, children are used.'),
    variant: z
      .enum(['primary', 'secondary', 'ghost'])
      .optional()
      .describe('Visual variant. Default: primary.'),
    disabled: z
      .boolean()
      .optional()
      .describe('Whether the button is disabled. Default: false.'),
  })
  .strict()
  .describe("Clickable button. Click events fire as `ui:click` with the layout node's ref.");

export type ButtonProps = z.infer<typeof ButtonPropsSchema>;

type Variant = 'primary' | 'secondary' | 'ghost';

const BASE_STYLE: CSSProperties = {
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 500,
  transition: 'background-color 100ms',
};

const primaryStyle = (isDisabled: boolean, isHovered: boolean, isActive: boolean): CSSProperties => ({
  ...BASE_STYLE,
  padding: '8px 16px',
  border: 'none',
  color: '#ffffff',
  cursor: isDisabled ? 'not-allowed' : 'pointer',
  background: isDisabled
    ? '#93c5fd'
    : isActive
      ? '#1e40af'
      : isHovered
        ? '#1d4ed8'
        : '#2563eb',
});

const secondaryStyle = (isDisabled: boolean, isHovered: boolean, isActive: boolean): CSSProperties => ({
  ...BASE_STYLE,
  padding: '8px 16px',
  border: `1px solid ${isDisabled ? '#e5e7eb' : isHovered ? '#9ca3af' : '#d1d5db'}`,
  color: isDisabled ? '#9ca3af' : '#1f2937',
  cursor: isDisabled ? 'not-allowed' : 'pointer',
  background: isDisabled
    ? '#ffffff'
    : isActive
      ? '#e5e7eb'
      : isHovered
        ? '#f3f4f6'
        : '#ffffff',
});

const ghostStyle = (isDisabled: boolean, isHovered: boolean, isActive: boolean): CSSProperties => ({
  ...BASE_STYLE,
  padding: '8px 12px',
  border: 'none',
  color: isDisabled ? '#93c5fd' : '#2563eb',
  cursor: isDisabled ? 'not-allowed' : 'pointer',
  background: isDisabled
    ? 'transparent'
    : isActive
      ? '#dbeafe'
      : isHovered
        ? '#eff6ff'
        : 'transparent',
});

const styleFor = (
  variant: Variant,
  isDisabled: boolean,
  isHovered: boolean,
  isActive: boolean,
): CSSProperties => {
  if (variant === 'primary') return primaryStyle(isDisabled, isHovered, isActive);
  if (variant === 'secondary') return secondaryStyle(isDisabled, isHovered, isActive);
  return ghostStyle(isDisabled, isHovered, isActive);
};

export const Button: NovaComponent<ButtonProps> = ({
  label,
  variant,
  disabled,
  novaRef,
  children,
}: NovaComponentProps & ButtonProps) => {
  const dispatch = useNovaDispatch();
  const [isHovered, setIsHovered] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const isDisabled = disabled ?? false;
  const style = styleFor(variant ?? 'primary', isDisabled, isHovered, isActive);
  const onClick = (_event: MouseEvent<HTMLButtonElement>): void => {
    if (isDisabled) return;
    if (novaRef === undefined) return;
    dispatch({ type: 'ui:click', ref: novaRef });
  };
  return (
    <button
      type="button"
      disabled={isDisabled}
      style={style}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsActive(false);
      }}
      onMouseDown={() => setIsActive(true)}
      onMouseUp={() => setIsActive(false)}
    >
      {label ?? children}
    </button>
  );
};

Button.meta = {
  description: "Clickable button. Click events fire as `ui:click` with the layout node's ref.",
  propsSchema: ButtonPropsSchema,
};
