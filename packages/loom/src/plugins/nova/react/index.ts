import type { NovaComponent } from '@niscorp/nova/adapters/react';
import type { LoomEditorPlugin } from '@react';
import { novaPlugin, PREVIEW, type NovaComponentShape } from '../index.js';
import { makePreview } from './preview.js';

export type NovaManifestEntry = NovaComponentShape & { render: NovaComponent };

export type NovaConfig = { manifest: readonly NovaManifestEntry[] };

export const nova = (config: NovaConfig): LoomEditorPlugin => {
  const components: Record<string, NovaComponent> = Object.fromEntries(
    config.manifest.map((entry) => [entry.name, entry.render]),
  );
  const shape: NovaComponentShape[] = config.manifest.map(({ name, props, container }) => ({ name, props, container }));
  const { name, documents, mount } = novaPlugin({ manifest: shape });
  return { name, documents, mount, components: { [PREVIEW]: makePreview(components) } };
};
