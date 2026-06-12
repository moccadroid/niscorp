import { createContext, useContext, useState, type CSSProperties, type FC, type ReactNode } from 'react';

// A small actions-menu primitive: a `⋯` trigger that opens a popover of items,
// with optional fly-out submenus. Shared by the array row menu and the Prism
// node editor so both look and behave the same. Presentational only — callers
// supply the items and what they do.

const trigger: CSSProperties = { padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 13, lineHeight: 1 };
const base: CSSProperties = { position: 'absolute', zIndex: 30, minWidth: 170, display: 'flex', flexDirection: 'column', background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, boxShadow: '0 6px 16px rgba(0,0,0,0.12)', padding: 4 };
const menuRight: CSSProperties = { ...base, top: '100%', right: 0, marginTop: 4 };
const menuLeft: CSSProperties = { ...base, top: '100%', left: 0, marginTop: 4 };
// A submenu flies away from the menu's anchored edge (and scrolls): out to the
// left for a right-anchored menu, out to the right for a left-anchored one. No
// gap (flush `100%`) so the pointer can cross into it without leaving the row.
const flyLeft: CSSProperties = { ...base, top: 0, right: '100%', maxHeight: 280, overflowY: 'auto' };
const flyRight: CSSProperties = { ...base, top: 0, left: '100%', maxHeight: 280, overflowY: 'auto' };
const itemStyle: CSSProperties = { width: '100%', boxSizing: 'border-box', textAlign: 'left', padding: '6px 10px', cursor: 'pointer', fontSize: 13, borderRadius: 4, whiteSpace: 'nowrap', display: 'flex', justifyContent: 'space-between', gap: 12 };
const itemDisabled: CSSProperties = { ...itemStyle, color: '#9ca3af', cursor: 'default' };
// Hover highlight (inline styles can't express `:hover`); the class is on every
// item, the rule injected once with the open menu.
const MENU_CSS = '.loom-menu-item{background:transparent;border:none;}.loom-menu-item:hover:not(:disabled){background:#f3f4f6;}';

type Anchor = 'left' | 'right';
const MenuContext = createContext<{ close: () => void; anchor: Anchor }>({ close: () => {}, anchor: 'right' });

// The trigger plus the popover. `anchor` is which edge the popover and its
// submenus hang from. Children are `MenuItem` / `SubMenu`.
export const ActionMenu: FC<{ label?: ReactNode; ariaLabel?: string; anchor?: Anchor; children: ReactNode }> = ({
  label = '⋯',
  ariaLabel = 'Actions',
  anchor = 'right',
  children,
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" aria-label={ariaLabel} onClick={() => setOpen((was) => !was)} style={trigger}>
        {label}
      </button>
      {open ? (
        <>
          <div onMouseDown={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 29 }} />
          <div style={anchor === 'right' ? menuRight : menuLeft}>
            <style>{MENU_CSS}</style>
            <MenuContext.Provider value={{ close: () => setOpen(false), anchor }}>{children}</MenuContext.Provider>
          </div>
        </>
      ) : null}
    </div>
  );
};

// A menu row: runs its action then closes the whole menu.
export const MenuItem: FC<{ label: ReactNode; onSelect: () => void; disabled?: boolean }> = ({ label, onSelect, disabled }) => {
  const { close } = useContext(MenuContext);
  return (
    <button
      type="button"
      className="loom-menu-item"
      disabled={disabled}
      onClick={() => {
        onSelect();
        close();
      }}
      style={disabled ? itemDisabled : itemStyle}
    >
      {typeof label === 'string' ? <span>{label}</span> : label}
    </button>
  );
};

// A row that flies out a submenu of its children on hover.
export const SubMenu: FC<{ label: ReactNode; children: ReactNode }> = ({ label, children }) => {
  const { anchor } = useContext(MenuContext);
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" className="loom-menu-item" onClick={() => setOpen((was) => !was)} style={itemStyle}>
        <span>{label}</span>
        <span>▸</span>
      </button>
      {open ? <div style={anchor === 'right' ? flyLeft : flyRight}>{children}</div> : null}
    </div>
  );
};
