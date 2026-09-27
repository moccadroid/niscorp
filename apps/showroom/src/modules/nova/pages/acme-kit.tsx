import type { ReactNode } from 'react';
import { createComponentRegistry, type ComponentRegistry } from '@niscorp/nova';
import { useNovaDispatch, type NovaComponent } from '@niscorp/nova/adapters/react';
import { BoxPropsSchema, ButtonPropsSchema, registerNovaReactComponents, TextPropsSchema } from '@niscorp/nova/adapters/react/components';

// ═══════════════════════════════════════════════════════════
// Acme Studio's kit — written on this page, for the landing page.
//
// Three components under names nova's builtins already use: Text, Box and
// Button. Each takes the SAME props as the builtin it replaces (its meta
// carries the builtin's schema), so any layout written for the builtins renders
// here unchanged. What differs is only what the names draw: a serif heading, a
// cream card, a sage pill. That is the whole claim — the layout says what a
// thing is; the kit decides how it looks.
// ═══════════════════════════════════════════════════════════

const SAGE = '#3f6f5a';
const INKY = '#2d2a26';
const CLAY = '#8a7f73';

type TextProps = { size?: string; weight?: string; children?: ReactNode };

// `color` is accepted (it is in the builtin's schema) and ignored: a kit owns
// its palette. Sizes map to Acme's type scale — xl is the serif display face.
const Text: NovaComponent<TextProps> = ({ size, weight, children }: TextProps) => {
  if (size === 'xl' || size === '2xl') {
    return <div style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 27, lineHeight: 1.1, color: INKY, letterSpacing: -0.3 }}>{children}</div>;
  }
  if (size === 'sm') {
    return <span style={{ fontSize: 11.5, color: CLAY, letterSpacing: 0.3 }}>{children}</span>;
  }
  return <span style={{ fontSize: 15, fontWeight: weight === 'bold' ? 650 : 450, color: INKY }}>{children}</span>;
};
Text.meta = { description: 'Acme type: serif display at xl, clay captions at sm.', propsSchema: TextPropsSchema };

type BoxProps = { border?: boolean; children?: ReactNode };

// A bordered Box is a card; a bare one is a row with a hairline under it.
const Box: NovaComponent<BoxProps> = ({ border, children }: BoxProps) =>
  border === true ? (
    <div style={{ padding: '12px 14px', borderRadius: 16, background: '#fffdf9', border: '1px solid #eadfd2', boxShadow: '0 6px 14px -10px rgba(63,111,90,0.5)' }}>{children}</div>
  ) : (
    <div style={{ padding: '10px 2px', borderBottom: '1px solid #eadfd2' }}>{children}</div>
  );
Box.meta = { description: 'Acme surface: a cream card when bordered, a ruled row when not.', propsSchema: BoxPropsSchema };

type ButtonProps = { label?: string; novaRef?: string; children?: ReactNode };

// Same event as the builtin — `ui:click` with the node's ref — so the action's
// triggers cannot tell which kit drew the button.
const Button: NovaComponent<ButtonProps> = ({ label, novaRef, children }: ButtonProps) => {
  const dispatch = useNovaDispatch();
  return (
    <button
      type="button"
      onClick={() => {
        if (novaRef !== undefined) dispatch({ type: 'ui:click', ref: novaRef });
      }}
      style={{ font: 'inherit', width: '100%', padding: '12px 16px', borderRadius: 999, border: 'none', background: SAGE, color: '#ffffff', fontSize: 14, fontWeight: 650, cursor: 'pointer', letterSpacing: 0.2 }}
    >
      {label ?? children}
    </button>
  );
};
Button.meta = { description: 'Acme action: a full-width sage pill.', propsSchema: ButtonPropsSchema };

export const ACME_KIT: Record<string, NovaComponent> = { Text, Box, Button };

// A registry: nova's builtins first (Stack, the slots), Acme's three on top.
export const builtinRegistry = (): ComponentRegistry<NovaComponent> => {
  const registry = createComponentRegistry<NovaComponent>();
  registerNovaReactComponents(registry);
  return registry;
};

export const acmeRegistry = (): ComponentRegistry<NovaComponent> => {
  const registry = builtinRegistry();
  registry.registerAll(ACME_KIT);
  return registry;
};
