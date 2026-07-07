// @niscorp/nova/agent — Cortex agents owned by Nova. Cortex is an optional peer
// dep; importing this subpath is what pulls it in.
export { layoutAgent, LayoutAgentOutputSchema } from './layout.agent';
export type { LayoutAgentOutput } from './layout.agent';

export { paletteFromRegistry } from './palette';
export type { LayoutPaletteEntry, PaletteFromRegistryOptions } from './palette';
