// @niscorp/nova/reflect — nova reads itself.
//
// Everything is closed, validated data — actions, layouts, endpoints, the live
// shell — so nova can introspect itself completely, a thing no code-based UI
// framework can. This surface is the formalization of walks and reflections
// that moss and app devtools kept re-deriving. Pure and framework-free.
//
//   walk    — the one structural traversal + collectors (componentsOf, …)
//   shell   — the running state (snapshotShell, describeInstance)
//   graph   — the action adjacency (actionGraph)
//   audit   — classification over auditAction (classifyAudit, auditCatalog)
export { walkNodes, componentsOf, refsOf, loopVarsOf, isRecord } from './walk';
export { snapshotShell, describeInstance } from './shell';
export type { ShellSnapshot, CanvasRef, InstanceRef, InstanceModel } from './shell';
export { actionGraph } from './graph';
export type { ActionGraph, ActionNode } from './graph';
export { classifyAudit, auditCatalog } from './audit';
export type { IssueClass, ClassifiedIssue, CatalogAuditRow } from './audit';
