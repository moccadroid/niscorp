// ═══════════════════════════════════════════════════════════
// Manifold types — public surface
// ═══════════════════════════════════════════════════════════

import type { AgentDefinition } from '../agent/define-agent';
import type { ToolDefinition } from '../tool/define-tool';
import type { Bus, Result, Unsubscribe } from '../types';
import type { ContextProducer, ResolvedContext } from '../context/types';
import type { SignalClient } from '../llm/signal-client';
import type { TokenEstimationMode } from '../context/tokens';
import type { ContextSpec } from '../context/types';
import type { RegisteredRule, RulesEngine, EffectHandler, EffectRegistry } from '../rules';
import type { StateStore, EventLog } from '../store/types';
import type { Registry } from './registry';
import type { Ledger, LedgerBudget } from './ledger';
import type { WorkflowContext } from './workflow-context';
import type { CreateBusOptions } from './bus';

export type ManifoldHooks = {
  onWorkflowStart?: (workflowId: string) => void;
  onWorkflowEnd?: (workflowId: string, result: unknown) => void;
  onError?: (error: unknown, context: { workflowId?: string; agentId?: string }) => void;
};

export type ManifoldConfig = {
  llm?: SignalClient;
  stateStore?: StateStore;
  eventLog?: EventLog;
  defaultContextSpec?: ContextSpec;
  defaultBudget?: Partial<LedgerBudget>;
  defaultPackBudget?: number;
  tokenEstimation?: TokenEstimationMode;
  compressorModel?: string;
  hooks?: ManifoldHooks;
  bus?: CreateBusOptions;
};

export type ExecuteOptions = {
  workflowId?: string;
  signal?: AbortSignal;
};

export type Manifold = {
  registerAgent: (agent: AgentDefinition) => Unsubscribe;
  registerTool: (tool: ToolDefinition) => Unsubscribe;
  addProducer: (producer: ContextProducer, scope?: { agentId?: string }) => Unsubscribe;
  registerRule: (rule: RegisteredRule) => Unsubscribe;
  registerEffect: (name: string, handler: EffectHandler) => void;
  bus: Bus;
  getState: (workflowId: string, key: string) => Promise<unknown>;
  setState: (workflowId: string, key: string, value: unknown) => Promise<void>;
  execute: <T>(agentId: string, input: unknown, options?: ExecuteOptions) => Promise<Result<T>>;
  previewContext: (agentId: string, input: unknown, options?: ExecuteOptions) => Promise<ResolvedContext>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  drain: () => Promise<void>;
  readonly _internal: {
    registry: Registry;
    ledger: Ledger;
    stateStore: StateStore;
    eventLog: EventLog;
    config: ManifoldConfig;
    rulesEngine: RulesEngine;
    effectRegistry: EffectRegistry;
    workflows: ReadonlyMap<string, WorkflowContext>;
  };
};
