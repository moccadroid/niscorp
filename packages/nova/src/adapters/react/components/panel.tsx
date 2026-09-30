import { PanelPropsSchema, type PanelProps } from '../../primitive-props';
import { useNovaDispatch } from '@react';
import type { NovaComponent, NovaComponentProps } from '@react';

// ═══════════════════════════════════════════════════════════
// Panel — a framed, elevated surface with an optional title header. The
// generic version of a dashboard/devtools panel; used by nova/devtools.
// `closeRef` grows a header ✕ firing ui:click with that ref (the same
// prop-ref convention as Table's rowRef).
// ═══════════════════════════════════════════════════════════

export { PanelPropsSchema, type PanelProps };

export const Panel: NovaComponent<PanelProps> = ({ title, backRef, closeRef, children }: NovaComponentProps & PanelProps) => {
  const dispatch = useNovaDispatch();
  return (
    <div style={{ border: '1px solid #d8dae0', borderRadius: 10, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.06)', padding: 12 }}>
      {title !== undefined && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
          {backRef !== undefined && (
            <button
              type="button"
              style={{ border: 'none', background: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 2 }}
              onClick={() => dispatch({ type: 'ui:click', ref: backRef })}
            >
              ←
            </button>
          )}
          <span style={{ flex: 1 }}>{title}</span>
          {closeRef !== undefined && (
            <button
              type="button"
              style={{ border: 'none', background: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 2 }}
              onClick={() => dispatch({ type: 'ui:click', ref: closeRef })}
            >
              ✕
            </button>
          )}
        </div>
      )}
      {children}
    </div>
  );
};

Panel.meta = { description: 'A framed, elevated surface with an optional title; `closeRef` adds a header ✕.', propsSchema: PanelPropsSchema };
