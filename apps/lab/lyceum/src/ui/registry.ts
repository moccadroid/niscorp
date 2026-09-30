import { createComponentRegistry } from '@niscorp/nova';
import type { ComponentRegistry } from '@niscorp/nova';
import type { DomComponent } from '@niscorp/nova/adapters/dom';
import type { Kit } from './kit.props';

import { text } from './kit.shape';

// The per-instance boundary a served tree carries (nova's ActionSlot, with the
// instance's identity in its props): a box around the action, which says which
// action it is and carries its id as a tag. The tag shows only while the screen
// is X-rayed (./tokens.ts); tapped, it opens that action (./target.ts).
export const ActionSlot: DomComponent = ({ props, children }) => {
  const box = document.createElement('div');
  const action = text(props['definitionId']) ?? '';
  box.setAttribute('data-action', action);
  box.setAttribute('data-instance', text(props['instanceId']) ?? '');
  const tag = document.createElement('span');
  tag.className = 'xray-tag';
  tag.textContent = action;
  box.append(tag, ...children);
  return box;
};

// One registry per kit, assembled once (AGENTS.md, rule 2) — the same names,
// painted by whichever kit it is given.
export const lyceumRegistry = (kit: Kit): ComponentRegistry<DomComponent> => {
  const registry = createComponentRegistry<DomComponent>();
  registry.registerAll({ ...kit, ActionSlot });
  return registry;
};
