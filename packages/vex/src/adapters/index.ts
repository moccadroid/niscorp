export { createPostgresAdapter } from './postgres/index.js';
export type { PostgresAdapterConfig, PgPool } from './postgres/index.js';
export type {
  DatabaseAdapter,
  AdapterCapabilities,
  CompiledQuery,
  ParamSlot,
  ContextContract,
  BoundParams,
  Row,
  IntrospectOptions,
} from './adapter.types.js';
