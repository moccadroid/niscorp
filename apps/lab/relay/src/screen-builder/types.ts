import type { ActionDefinition, ComponentRegistry, FetchFn, TransformFn } from '@niscorp/nova';
import type { ContextMeta, DiscoveryResponse, QueryRequest, QueryResponse } from '@niscorp/vex';

// A component that draws rows: the prop holding them, and the ref a click on one fires with what payload.
export type ListComponent = {
  rows: string;
  rowRef?: string;
  rowPayload?: (row: Record<string, unknown>, props: Record<string, unknown>) => unknown;
};

export type ProbeStep = { set?: string; to?: string | number | boolean; click?: string };

// What a person does on the screen, and what must follow: a data key whose content changes, or an action that opens.
export type Probe = { do: ProbeStep[]; changes?: string; opens?: string };

export type Example = { intent: string; prove: Partial<QueryRequest>[]; action: ActionDefinition; probes: Probe[] };

export type Kit = {
  registry: ComponentRegistry;
  offer: readonly string[];
  omitProps?: readonly string[];
  lists: Readonly<Record<string, ListComponent>>;
  layoutRules?: string;
  examples: readonly Example[];
};

export type CatalogEntry = { id: string; description: string; input: Record<string, unknown> };

export type Vex = {
  endpoint: string;
  discover: () => Promise<DiscoveryResponse>;
  execute: (request: QueryRequest) => Promise<QueryResponse>;
};

// `transform` and `ambient` are what the host's shell does to every endpoint call: the builder mounts with the same.
export type ScreenSetup = {
  kit: Kit;
  vex: Vex;
  catalog: readonly CatalogEntry[];
  wire: FetchFn;
  transform: TransformFn;
  ambient: Readonly<Record<string, unknown>>;
};

export type FindingCode =
  | 'schema'
  | 'audit'
  | 'set-path'
  | 'unknown-fingerprint'
  | 'no-data'
  | 'endpoint'
  | 'transform'
  | 'mount'
  | 'unresolved-binding'
  | 'load-empty'
  | 'unshown-rows'
  | 'probe-missing'
  | 'probe';

export type Finding = { code: FindingCode; message: string };

export type Proof = { count: number; context: Record<string, ContextMeta>; intent?: string };

export type CheckResult = { ok: boolean; findings: Finding[]; loaded: Record<string, string> };

export type BuildOutcome =
  | { ok: true; action: ActionDefinition; probes: Probe[]; proofs: ReadonlyMap<string, Proof> }
  | { ok: false; error: string; findings: Finding[]; candidate?: ActionDefinition };
