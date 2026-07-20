// @niscorp/nova/adapters/dom/components — the default DOM reference kit: domain-blind
// primitives, a registry that registers them, and a self-contained stylesheet.
// The renderer (@niscorp/nova/adapters/dom) is separate; a terminal composes the two.
export { defaultRegistry } from './registry';
export { fallback } from './components';
export { DEFAULT_CSS, ROOT_CLASS } from './styles';
export * as components from './components';
