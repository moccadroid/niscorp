import { createContext, useContext, type CSSProperties } from 'react';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { isRecord } from '@compile/parse';
import type { Pattern } from '@compile/types';
import { useModelWrite } from '../hooks/model.js';
import { decodeLiteral, inputStyle, matches } from './shared.js';

const variantStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 };

type Branch = { label: string; pattern: Pattern; defaults: unknown; childrenKey?: string };

const ActiveBranch = createContext(0);

export const LoomBranch: NovaComponent<{ index?: number }> = ({ index, children }) =>
  useContext(ActiveBranch) === index ? <>{children}</> : null;

export const LoomVariant: NovaComponent<{ value?: unknown; branches?: unknown }> = ({
  value,
  branches,
  children,
  novaModel,
}) => {
  const set = useModelWrite(novaModel);
  const options = decodeLiteral<Branch[]>(branches) ?? [];
  const matched = options.findIndex((branch) => matches(value, branch.pattern));
  const fallback = options.findIndex((branch) => branch.pattern.kind === 'fallback');
  const active = matched >= 0 ? matched : Math.max(0, fallback);
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
