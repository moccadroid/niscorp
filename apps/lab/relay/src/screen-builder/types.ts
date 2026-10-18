import type { ActionDefinition, ComponentRegistry, FetchFn, TransformFn } from '@niscorp/nova';
import type { ContextMeta, DiscoveryResponse, QueryRequest, QueryResponse } from '@niscorp/vex';

// A component that draws rows: the prop holding them, the ref a click on one fires with what payload, and the row keys it reads.
export type ListComponent = {
  rows: string;
  rowRef?: string;
  rowPayload?: (row: Record<string, unknown>, props: Record<string, unknown>) => unknown;
  reads?: (props: Record<string, unknown>) => string[];
};

// What a click on a component carries, read from its props.
export type ClickPayload = (props: Record<string, unknown>) => unknown;

export type ProbeStep = { set?: string; to?: string | number | boolean; click?: string };

// What a person does on the screen, and what must follow: a data key whose content changes, an action that opens,
// or — for a click alone, a refresh — a data key whose endpoint is called again.
export type Probe = { do: ProbeStep[]; changes?: string; opens?: string; reloads?: string };

export type Example = { intent: string; prove: Partial<QueryRequest>[]; action: ActionDefinition; probes: Probe[] };

export type Kit = {
  registry: ComponentRegistry;
  offer: readonly string[];
  omitProps?: readonly string[];
  lists: Readonly<Record<string, ListComponent>>;
  clicks?: Readonly<Record<string, ClickPayload>>;
  // The components that send what is typed or picked in them as ui:model; every other one is clicked.
  inputs?: readonly string[];
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
  // The message channels the host's screens emit and listen on; left out, channels are not judged.
  channels?: readonly string[];
  wire: FetchFn;
  transform: TransformFn;
  ambient: Readonly<Record<string, unknown>>;
};

export type FindingCode =
  | 'schema'
  | 'audit'
  | 'set-path'
  | 'unknown-fingerprint'
  | 'frozen-value'
  | 'ignored-context'
  | 'empty-pattern'
  | 'dead-trigger'
  | 'empty-optional'
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
