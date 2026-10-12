import { renderToString } from '@niscorp/nova/adapters/dom/server';
import type { DomComponent } from '@niscorp/nova/adapters/dom';
import { defaultRegistry, fallback } from '@niscorp/nova/adapters/dom/components';
import type { ComponentRegistry } from '@niscorp/nova';
import { drawnApi } from '../targets';
import type { DrawnSnapshot } from '../targets';

export type RenderSnapshotConfig = {
  snapshot: DrawnSnapshot;
  registry?: ComponentRegistry<DomComponent>;
  // A DOM to build the elements in: the window of jsdom, happy-dom or linkedom.
  window: object;
};

export const renderSnapshot = (config: RenderSnapshotConfig): string =>
  renderToString(config.registry ?? defaultRegistry(), drawnApi(config.snapshot), { window: config.window, fallback });
