export type VexEvent =
  | { type: 'query.start'; intent?: string; shape?: unknown; fingerprint?: string; entities?: string[] }
  | { type: 'query.cache'; hit: boolean; fingerprint?: string; replaced?: boolean }
  | { type: 'query.dsl'; dsl: unknown; agentMs: number }
  | { type: 'query.sql'; sql: string; warnings: string[] }
  | { type: 'query.rows'; count: number; executionMs: number }
  | { type: 'query.mapped'; mappingMs: number }
  | { type: 'query.done'; totalMs: number }
  | { type: 'query.error'; code: string; message: string }
  | { type: 'llm.request'; agent: string; iteration: number; messages: number; tools: string[] }
  | { type: 'llm.response'; agent: string; iteration: number; content: string; toolCalls: Array<{ name: string; args: unknown }>; finishReason: string; tokens: number; ms: number };

export type VexEventHandler = (event: VexEvent) => void;
