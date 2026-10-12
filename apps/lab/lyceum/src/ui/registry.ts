import { createComponentRegistry } from '@niscorp/nova';
import type { ComponentRegistry } from '@niscorp/nova';
import type { DomComponent } from '@niscorp/nova/adapters/dom';
import type { Kit } from './kit.props';

import { text } from './kit.shape';

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

export const lyceumRegistry = (kit: Kit): ComponentRegistry<DomComponent> => {
  const registry = createComponentRegistry<DomComponent>();
  registry.registerAll({ ...kit, ActionSlot });
  return registry;
};
