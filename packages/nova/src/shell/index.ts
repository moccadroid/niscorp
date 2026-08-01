// ═══════════════════════════════════════════════════════════
// @niscorp/nova — Shell System
//
// The shell is the top-level orchestration boundary. Only the
// public Shell type, its config, and its state types are exposed.
// Canvas, runtime registry, telemetry, and lifecycle ops are
// internal — used by `createShell` and by tests via area-specific
// imports.
// ═══════════════════════════════════════════════════════════

export type {
  CanvasConfig,
  CanvasInitialSeed,
  CanvasState,
  RenderApi,
  Shell,
  ShellConfig,
  ShellTelemetry,
  StateSnapshot,
  StateChangeHandler as ShellStateChangeHandler,
  DataChangeEvent as ShellDataChangeEvent,
  DataChangeHandler as ShellDataChangeHandler,
  CanvasChangeHandler as ShellCanvasChangeHandler,
  PushOptions,
} from './types';

export { createShell } from './shell';
export { CANVAS_SLOT_NAME, ACTION_SLOT_NAME } from './slot-names';
export { reconcileCanvas } from './reconcile';
export type { Desired, ReconcileOptions, ReconcileResult } from './reconcile';
