// Relay's experimental mutation layer — the write engine + its HTTP front.
// Kept in relay (not @niscorp/vex) on purpose: Vex mutations are still an
// experimental edge. Imported as `@relay/vex/mutations`.
export * from './engine';
export { handleMutation, type VexMutationConfig, type MutationResult } from './handler';
