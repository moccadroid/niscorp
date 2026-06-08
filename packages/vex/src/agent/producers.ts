import type { ContextProducer, BuildContext, ContentChunk } from '@niscorp/cortex';
import type { DatabaseSchema } from '../schemas/database.schema.js';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type ProducerDeps = {
  getSchema: () => DatabaseSchema | undefined;
  getQuerySchema: () => object;
};

export type { ContextProducer, ContentChunk, BuildContext };

// ═══════════════════════════════════════════════════════════════
// Factory
// ═══════════════════════════════════════════════════════════════

export const createQueryProducers = (deps: ProducerDeps): ContextProducer[] => [
  {
    id: 'vex.schema',
    priority: 90,
    build: () => {
      const schema = deps.getSchema();
      if (!schema) return [];
      return [{
        role: 'system' as const,
        content: `Database schema:\n${JSON.stringify(schema)}`,
        source: 'vex.schema',
        evictable: false,
      }];
    },
  },
  {
    id: 'vex.dslSpec',
    priority: 85,
    build: () => [{
      role: 'system' as const,
      content: `DSL specification (JSON Schema):\n${JSON.stringify(deps.getQuerySchema())}`,
      source: 'vex.dslSpec',
      evictable: false,
    }],
  },
];
