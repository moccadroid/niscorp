import type { JsonObject, JsonValue } from '@niscorp/prism';
export type { JsonObject, JsonValue } from '@niscorp/prism';
export type Outcome =
  | {
      status: 'completed';
      value: JsonValue;
      error: null;
    }
  | {
      status: 'failed';
      value: null;
      error: {
        code: string;
        message: string;
      };
    }
  | {
      status: 'skipped';
      value: null;
      error: null;
    };
export interface OperationContext {
  readonly signal: AbortSignal;
}
export interface Operation {
  readonly inputSchema: JsonObject;
  readonly outputSchema: JsonObject;
  readonly run: (input: JsonValue, context: OperationContext) => Promise<JsonValue>;
}
export type Operations = Readonly<Record<string, Operation>>;
