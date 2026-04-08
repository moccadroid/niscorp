import { useState, type ChangeEvent, type CSSProperties } from 'react';
import { z } from 'zod';
import { useNovaDispatch, type NovaComponent, type NovaComponentProps } from '@react';

// ═══════════════════════════════════════════════════════════
// Input — text input bound to model
//
// Number inputs still dispatch a string payload; mutation ops
// handle parsing on the action side.
// ═══════════════════════════════════════════════════════════

export const InputPropsSchema = z
  .object({
    type: z
      .enum(['text', 'number', 'email', 'password'])
      .optional()
      .describe('Input type. Default: text.'),
    placeholder: z
      .string()
      .optional()
      .describe('Placeholder text shown when empty.'),
    disabled: z
      .boolean()
      .optional()
      .describe('Whether the input is disabled. Default: false.'),
    value: z
      .string()
      .optional()
      .describe('Current value. Typically supplied via model binding.'),
  })
  .strict()
  .describe('Text input bound to data via the `model` field on the layout node.');

export type InputProps = z.infer<typeof InputPropsSchema>;

const computeStyle = (isDisabled: boolean, isFocused: boolean, isHovered: boolean): CSSProperties => {
  const borderColor = isDisabled
    ? '#d1d5db'
    : isFocused
      ? '#2563eb'
      : isHovered
        ? '#9ca3af'
        : '#d1d5db';
  return {
    padding: '8px 12px',
    border: `1px solid ${borderColor}`,
    borderRadius: 6,
    fontSize: 14,
    background: isDisabled ? '#f9fafb' : '#ffffff',
    color: isDisabled ? '#9ca3af' : 'inherit',
    cursor: isDisabled ? 'not-allowed' : 'text',
    minWidth: 240,
    outline: 'none',
    boxShadow: isFocused ? '0 0 0 3px rgba(37, 99, 235, 0.15)' : 'none',
    transition: 'border-color 150ms, box-shadow 150ms',
  };
};

export const Input: NovaComponent<InputProps> = ({
  type,
  placeholder,
  disabled,
  value,
  novaModel,
}: NovaComponentProps & InputProps) => {
  const dispatch = useNovaDispatch();
  const [isFocused, setIsFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const isDisabled = disabled ?? false;
  const onChange = (event: ChangeEvent<HTMLInputElement>): void => {
    if (novaModel === undefined) return;
    dispatch({ type: 'ui:model', ref: novaModel.ref, payload: event.target.value });
  };
  return (
    <input
      type={type ?? 'text'}
      placeholder={placeholder}
      disabled={isDisabled}
      value={value ?? ''}
      onChange={onChange}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={computeStyle(isDisabled, isFocused, isHovered)}
    />
  );
};

Input.meta = {
  description: 'Text input bound to data via the `model` field on the layout node.',
  propsSchema: InputPropsSchema,
};
