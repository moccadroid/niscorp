import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import { z } from 'zod';
import { useNovaDispatch, type NovaComponent, type NovaComponentProps } from '@react';

// ═══════════════════════════════════════════════════════════
// Input — text input bound to model
//
// Number inputs still dispatch a string payload; mutation ops
// handle parsing on the action side.
//
// Two remote round-trip obligations (ADAPTER.md §6), because the shell may be
// authoritative over a socket:
//  - it holds local editing state while focused, so an async tree echo can't
//    clobber the value the user is mid-typing;
//  - it honours the layout's `debounce` prop, coalescing keystrokes before
//    they hit the wire. A local shell echoes synchronously and neither matters,
//    but a remote one drops keystrokes without them.
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
    debounce: z
      .number()
      .optional()
      .describe('Milliseconds to coalesce keystrokes before dispatching ui:model. Default: 0 (every keystroke). Set it when the shell is remote to cut round-trips.'),
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
  debounce,
  novaModel,
}: NovaComponentProps & InputProps) => {
  const dispatch = useNovaDispatch();
  const [isHovered, setIsHovered] = useState(false);
  // `draft` is the local editing value; `null` means "not editing — the
  // server value is authoritative". While editing (focused) the draft wins,
  // so an async tree echo arriving mid-type never resets what the user typed.
  const [draft, setDraft] = useState<string | null>(null);
  const isFocused = draft !== null;
  const shown = draft ?? value ?? '';
  const isDisabled = disabled ?? false;
  const debounceMs = debounce ?? 0;

  // A single pending debounced dispatch — cancelled on the next keystroke,
  // flushed on blur, dropped on unmount (a keystroke against a screen that has
  // gone is worse than a lost one — the same reasoning as the socket's).
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clearPending = (): void => {
    if (timer.current !== undefined) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
  };
  useEffect(() => clearPending, []);

  const fire = (next: string): void => {
    if (novaModel === undefined) return;
    dispatch({ type: 'ui:model', ref: novaModel.ref, payload: next });
  };

  const onChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const next = event.target.value;
    setDraft(next);
    if (debounceMs > 0) {
      clearPending();
      timer.current = setTimeout(() => {
        timer.current = undefined;
        fire(next);
      }, debounceMs);
    } else {
      fire(next);
    }
  };

  const onFocus = (): void => setDraft(value ?? '');
  const onBlur = (): void => {
    // Flush any pending keystroke now, then hand authority back to the server.
    if (timer.current !== undefined && draft !== null) {
      clearPending();
      fire(draft);
    }
    setDraft(null);
  };

  return (
    <input
      type={type ?? 'text'}
      placeholder={placeholder}
      disabled={isDisabled}
      value={shown}
      onChange={onChange}
      onFocus={onFocus}
      onBlur={onBlur}
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
