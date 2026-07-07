// Vex over HTTP — the resource layer. `vexFetch` serves `/api/<resource>/vex`
// URLs against the in-browser engine; `resources.ts` defines the scoped surfaces.
// (Action endpoints are inline declarative literals now — see any `*.action.ts`.)
export { vexFetch } from './fetch';
export { RESOURCES, resourceEntities, type VexResource } from './resources';
