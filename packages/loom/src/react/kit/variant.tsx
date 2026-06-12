import { createContext, useContext, type CSSProperties } from 'react';
import type { NovaComponent } from '@niscorp/nova/react';
import { isRecord } from '@compile/parse';
import type { Pattern } from '@compile/types';
import { useModelWrite } from '../hooks/model.js';
import { decodeLiteral, inputStyle, matches } from './shared.js';

// The union editor and its branch wrappers.

const variantStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 };

type Branch = { label: string; pattern: Pattern; defaults: unknown; childrenKey?: string };

// The active branch index, shared from the variant down to its branch wrappers.
const ActiveBranch = createContext(0);

// One branch of a variant — renders its editor only when it is the active one.
export const LoomBranch: NovaComponent<{ index?: number }> = ({ index, children }) =>
  useContext(ActiveBranch) === index ? <>{children}</> : null;

// A union editor: a type chooser plus the active branch. It matches the current
// value to a branch in JS, tells the branches which is active (via context), and
// each shows or hides itself; on change it writes the chosen branch's default,
// reshaping the value. Tagged, structural, and mixed unions are the same code —
// only the pattern differs.
export const LoomVariant: NovaComponent<{ value?: unknown; branches?: unknown }> = ({
  value,
  branches,
  children,
  novaModel,
}) => {
  const set = useModelWrite(novaModel);
  const options = decodeLiteral<Branch[]>(branches) ?? [];
  // The first branch whose pattern matches the value; failing that, the open
  // `fallback` branch (which never matches positively), else the first branch.
  const matched = options.findIndex((branch) => matches(value, branch.pattern));
  const fallback = options.findIndex((branch) => branch.pattern.kind === 'fallback');
  const active = matched >= 0 ? matched : Math.max(0, fallback);
  // Switching between two container variants carries the children over; switching
  // to one without a child-list drops them (after a confirm).
  const switchTo = (chosen: Branch): void => {
    const activeKey = options[active]?.childrenKey;
    const oldChildren = activeKey !== undefined && isRecord(value) ? value[activeKey] : undefined;
    if (chosen.childrenKey !== undefined && Array.isArray(oldChildren)) {
      set({ ...(isRecord(chosen.defaults) ? chosen.defaults : {}), [chosen.childrenKey]: oldChildren });
      return;
    }
    if (Array.isArray(oldChildren) && oldChildren.length > 0 && !window.confirm('This type has no children. Discard them?')) return;
    set(chosen.defaults);
  };
  return (
    <div style={variantStyle}>
      <select
        value={active}
        onChange={(event) => {
          const chosen = options[Number(event.target.value)];
          if (chosen !== undefined) switchTo(chosen);
        }}
        style={inputStyle}
      >
        {options.map((branch, index) => (
          <option key={index} value={index}>
            {branch.label}
          </option>
        ))}
      </select>
      <ActiveBranch.Provider value={active}>{children}</ActiveBranch.Provider>
    </div>
  );
};
