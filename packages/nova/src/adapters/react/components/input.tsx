import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import { InputPropsSchema, type InputProps } from '../../primitive-props';
import { useNovaDispatch, type NovaComponent, type NovaComponentProps } from '@react';

export { InputPropsSchema, type InputProps };

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
  // `null` means not editing: the tree's value shows. While focused the draft
  // wins, so a tree echo that arrives mid-typing does not reset what was typed.
  const [draft, setDraft] = useState<string | null>(null);
  const isFocused = draft !== null;
  const shown = draft ?? value ?? '';
  const isDisabled = disabled ?? false;
  const debounceMs = debounce ?? 0;

  // A pending dispatch is dropped on unmount, not flushed: a keystroke against a
  // screen that has gone is worse than a lost one.
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
