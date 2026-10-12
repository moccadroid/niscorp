import { defineComponent, h, onBeforeUnmount, shallowRef, type CSSProperties } from 'vue';
import { ButtonPropsSchema, InputPropsSchema, type ButtonProps, type InputProps } from '../../primitive-props';
import { useNovaDispatch } from '../composables/context';
import type { NovaComponentProps } from '../types';

export { ButtonPropsSchema, type ButtonProps, InputPropsSchema, type InputProps };

type Variant = 'primary' | 'secondary' | 'ghost';

const BASE_STYLE: CSSProperties = {
  borderRadius: '6px',
  fontSize: '14px',
  fontWeight: 500,
  transition: 'background-color 100ms',
};

const buttonStyle = (variant: Variant, isDisabled: boolean, isHovered: boolean, isActive: boolean): CSSProperties => {
  const cursor = isDisabled ? 'not-allowed' : 'pointer';
  if (variant === 'primary') {
    return {
      ...BASE_STYLE,
      padding: '8px 16px',
      border: 'none',
      color: '#ffffff',
      cursor,
      background: isDisabled ? '#93c5fd' : isActive ? '#1e40af' : isHovered ? '#1d4ed8' : '#2563eb',
    };
  }
  if (variant === 'secondary') {
    return {
      ...BASE_STYLE,
      padding: '8px 16px',
      border: `1px solid ${isDisabled ? '#e5e7eb' : isHovered ? '#9ca3af' : '#d1d5db'}`,
      color: isDisabled ? '#9ca3af' : '#1f2937',
      cursor,
      background: isDisabled ? '#ffffff' : isActive ? '#e5e7eb' : isHovered ? '#f3f4f6' : '#ffffff',
    };
  }
  return {
    ...BASE_STYLE,
    padding: '8px 12px',
    border: 'none',
    color: isDisabled ? '#93c5fd' : '#2563eb',
    cursor,
    background: isDisabled ? 'transparent' : isActive ? '#dbeafe' : isHovered ? '#eff6ff' : 'transparent',
  };
};

export const Button = Object.assign(
  defineComponent(
    (props: NovaComponentProps & ButtonProps, { slots }) => {
      const dispatch = useNovaDispatch();
      const isHovered = shallowRef(false);
      const isActive = shallowRef(false);
      const onClick = (): void => {
        if (props.disabled === true) return;
        if (props.novaRef === undefined) return;
        dispatch({ type: 'ui:click', ref: props.novaRef });
      };
      return () => {
        const isDisabled = props.disabled ?? false;
        return h(
          'button',
          {
            type: 'button',
            disabled: isDisabled,
            style: buttonStyle(props.variant ?? 'primary', isDisabled, isHovered.value, isActive.value),
            onClick,
            onMouseenter: () => (isHovered.value = true),
            onMouseleave: () => {
              isHovered.value = false;
              isActive.value = false;
            },
            onMousedown: () => (isActive.value = true),
            onMouseup: () => (isActive.value = false),
          },
          props.label ?? slots.default?.(),
        );
      };
    },
    { name: 'NovaButton', props: ['label', 'variant', 'disabled', 'novaRef'], inheritAttrs: false },
  ),
  { meta: { description: "Clickable button. Click events fire as `ui:click` with the layout node's ref.", propsSchema: ButtonPropsSchema } },
);

const inputStyle = (isDisabled: boolean, isFocused: boolean, isHovered: boolean): CSSProperties => ({
  padding: '8px 12px',
  border: `1px solid ${isDisabled ? '#d1d5db' : isFocused ? '#2563eb' : isHovered ? '#9ca3af' : '#d1d5db'}`,
  borderRadius: '6px',
  fontSize: '14px',
  background: isDisabled ? '#f9fafb' : '#ffffff',
  color: isDisabled ? '#9ca3af' : 'inherit',
  cursor: isDisabled ? 'not-allowed' : 'text',
  minWidth: '240px',
  outline: 'none',
  boxShadow: isFocused ? '0 0 0 3px rgba(37, 99, 235, 0.15)' : 'none',
  transition: 'border-color 150ms, box-shadow 150ms',
});

export const Input = Object.assign(
  defineComponent(
    (props: NovaComponentProps & InputProps) => {
      const dispatch = useNovaDispatch();
      const isHovered = shallowRef(false);
      // `null` means not editing: the tree's value shows. While focused the draft
      // wins, so a tree echo that arrives mid-typing does not reset what was typed.
      const draft = shallowRef<string | null>(null);
      // A pending dispatch is dropped on unmount, not flushed: a keystroke against
      // a screen that has gone is worse than a lost one.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const clearPending = (): void => {
        if (timer !== undefined) {
          clearTimeout(timer);
          timer = undefined;
        }
      };
      onBeforeUnmount(clearPending);

      const fire = (next: string): void => {
        if (props.novaModel === undefined) return;
        dispatch({ type: 'ui:model', ref: props.novaModel.ref, payload: next });
      };

      const onInput = (event: Event): void => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        const next = target.value;
        draft.value = next;
        const debounceMs = props.debounce ?? 0;
        if (debounceMs > 0) {
          clearPending();
          timer = setTimeout(() => {
            timer = undefined;
            fire(next);
          }, debounceMs);
        } else {
          fire(next);
        }
      };

      const onFocus = (): void => {
        draft.value = props.value ?? '';
      };
      const onBlur = (): void => {
        const pending = draft.value;
        if (timer !== undefined && pending !== null) {
          clearPending();
          fire(pending);
        }
        draft.value = null;
      };

      return () => {
        const isDisabled = props.disabled ?? false;
        return h('input', {
          type: props.type ?? 'text',
          placeholder: props.placeholder,
          disabled: isDisabled,
          value: draft.value ?? props.value ?? '',
          onInput,
          onFocus,
          onBlur,
          onMouseenter: () => (isHovered.value = true),
          onMouseleave: () => (isHovered.value = false),
          style: inputStyle(isDisabled, draft.value !== null, isHovered.value),
        });
      };
    },
    {
      name: 'NovaInput',
      props: ['type', 'placeholder', 'disabled', 'value', 'debounce', 'novaModel'],
      inheritAttrs: false,
    },
  ),
  { meta: { description: 'Text input bound to data via the `model` field on the layout node.', propsSchema: InputPropsSchema } },
);
