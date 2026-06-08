import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import {
  createQueryEngine,
  createPostgresAdapter,
  createMemoryCache,
  createPostgresCache,
  createTieredCache,
} from '@niscorp/vex';
import type { CacheBackend, VexEvent, VexEventHandler } from '@niscorp/vex';
import { createQueryDsl, createShapeMapper } from '@niscorp/vex/agent';
import { vex } from '@niscorp/vex/hono';
import { createSignal } from '@niscorp/signal';
import type { SignalClient } from '@niscorp/cortex';
import { seed } from './seed.js';

const DATABASE_URL = process.env['DATABASE_URL'] ?? 'postgresql://vex:vex@localhost:5433/vex_dev';
const OPENROUTER_API_KEY = process.env['OPENROUTER_API_KEY'];
const OPENAI_API_KEY = process.env['OPENAI_API_KEY'];
const PORT = Number(process.env['PORT'] ?? 3456);
const CACHE_BACKEND = process.env['VEX_CACHE'] ?? 'memory';
const CACHE_SCHEMA = process.env['VEX_CACHE_SCHEMA'] ?? 'public';
const CACHE_TABLE = process.env['VEX_CACHE_TABLE'] ?? 'vex_cache';

// ─── Postgres ────────────────────────────────────────────────

const pool = new pg.Pool({ connectionString: DATABASE_URL });

const ensureSeeded = async (): Promise<void> => {
  const result = await pool.query(
    `SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'customers'
    ) AS seeded`,
  );
  const seeded = result.rows[0]?.seeded === true;

  if (seeded) {
    console.log('Database already seeded.');
    return;
  }

  console.log('Seeding database...');
  await seed();
  console.log('Seed complete.');
};

// ─── Logging ────────────────────────────────────────────────

const LOG_DIR = path.resolve(import.meta.dirname ?? '.', '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'vex-debug.log');

const consoleLogger: VexEventHandler = (event) => {
  switch (event.type) {
    case 'query.start': {
      const intent = event.intent ? `"${event.intent}"` : '(no intent)';
      const entities = event.entities ? `[${event.entities.join(',')}]` : 'all';
      process.stdout.write(`  ${intent}  entities:${entities}`);
      break;
    }
    case 'query.cache':
      process.stdout.write(`  cache:${event.hit ? 'hit' : 'miss'}`);
      break;
    case 'query.dsl':
      process.stdout.write(`  query:${event.agentMs}ms`);
      break;
    case 'query.sql':
      break;
    case 'query.rows':
      process.stdout.write(`  sql:${event.executionMs}ms(${event.count})`);
      break;
    case 'query.mapped':
      process.stdout.write(`  map:${event.mappingMs}ms`);
      break;
    case 'query.done':
      process.stdout.write(`  ${event.totalMs}ms\n`);
      break;
    case 'query.error':
      process.stdout.write(`  ERROR:${event.code}\n`);
      break;
    case 'llm.request':
      break;
    case 'llm.response':
      break;
  }
};

const ensureLogDir = () => {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
};

const fileLogger: VexEventHandler = (event) => {
  if (event.type !== 'llm.request' && event.type !== 'llm.response') return;

  const ts = new Date().toISOString();
  let entry: string;

  if (event.type === 'llm.request') {
    entry = [
      `\n${'─'.repeat(70)}`,
      `[${ts}] ${event.agent} #${event.iteration} REQUEST`,
      `${'─'.repeat(70)}`,
      `  tools: ${event.tools.join(', ')}`,
      `  messages: ${event.messages}`,
      '',
    ].join('\n');
  } else {
    const toolCalls = event.toolCalls.length > 0
      ? event.toolCalls.map(tc => `  TOOL CALL: ${tc.name}(${JSON.stringify(tc.args).slice(0, 300)})`).join('\n')
      : '';
    entry = [
      `\n${'─'.repeat(70)}`,
      `[${ts}] ${event.agent} #${event.iteration} RESPONSE (${event.ms}ms, ${event.tokens} tokens, ${event.finishReason})`,
      `${'─'.repeat(70)}`,
      toolCalls,
      event.content ? `  CONTENT:\n${event.content.split('\n').map(l => `  | ${l}`).join('\n')}` : '',
      '',
    ].join('\n');
  }

  fs.appendFileSync(LOG_FILE, entry);
};

const createEventHandler = (): VexEventHandler => {
  ensureLogDir();
  return (event) => {
    consoleLogger(event);
    fileLogger(event);
  };
};

// ─── LLM wrapper ────────────────────────────────────────────

const wrapLlm = (llm: SignalClient, label: string, onEvent: VexEventHandler): SignalClient => {
  let callCount = 0;
  const origStep = llm.step.bind(llm);

  return {
    step: async (request) => {
      callCount++;
      onEvent({
        type: 'llm.request',
        agent: label,
        iteration: callCount,
        messages: request.messages.length,
        tools: (request.tools ?? []).map(t => t.name),
      });

      // Write full request to file log
      const ts = new Date().toISOString();
      const requestDump = request.messages.map(msg => {
        const raw = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        const role = msg.role.toUpperCase();
        const toolInfo = 'toolCallId' in msg && msg.toolCallId ? ` (${(msg as Record<string, unknown>).name ?? msg.toolCallId})` : '';
        return `  [${role}${toolInfo}] (${raw.length} chars)\n${raw.split('\n').map(l => `  | ${l}`).join('\n')}`;
      }).join('\n\n');
      fs.appendFileSync(LOG_FILE, `[${ts}] ${label} #${callCount} MESSAGES:\n${requestDump}\n`);

      const t0 = Date.now();
      const result = await origStep(request);
      const ms = Date.now() - t0;

      onEvent({
        type: 'llm.response',
        agent: label,
        iteration: callCount,
        content: result.content,
        toolCalls: result.toolCalls.map(tc => ({ name: tc.name, args: tc.args })),
        finishReason: result.finishReason,
        tokens: result.usage.totalTokens,
        ms,
      });

      return result;
    },
    stepStream: llm.stepStream.bind(llm),
    count: llm.count.bind(llm),
  };
};

// ─── Cache ──────────────────────────────────────────────────

const buildCache = async (): Promise<CacheBackend> => {
  if (CACHE_BACKEND === 'postgres') {
    const onError = (err: unknown) => console.error('[vex:cache]', err);
    const l2 = createPostgresCache({ pool, schema: CACHE_SCHEMA, table: CACHE_TABLE, onError });
    const cache = createTieredCache({ l1: createMemoryCache(), l2, onError });
    await cache.init(); // creates schema/table if needed, loads L2 → L1 (warm-up)
    const warm = (await cache.keys()).length;
    console.log(`Cache: postgres (tiered, ${CACHE_SCHEMA}.${CACHE_TABLE}, ${warm} warm entries)`);
    return cache;
  }
  console.log('Cache: memory');
  return createMemoryCache();
};

// ─── Server ─────────────────────────────────────────────────

const main = async () => {
  await ensureSeeded();

  const onEvent = createEventHandler();
  const embed = OPENAI_API_KEY
    ? (text: string, dimensions?: number) =>
        createSignal('openai', { apiKey: OPENAI_API_KEY, model: 'text-embedding-3-small' })
          .embed(text, dimensions ? { dimensions } : undefined)
    : undefined;
  if (embed) console.log('Embedding: openai (text-embedding-3-small)');

  const adapter = createPostgresAdapter({ pool });
  const cache = await buildCache();
  const engine = createQueryEngine({ adapter, onEvent, cache, embed });

  console.log('Introspecting database...');
  const schema = await engine.introspect();
  console.log(`Found ${schema.entities.length} entities.`);

  if (!OPENROUTER_API_KEY) {
    console.warn('No OPENROUTER_API_KEY — running without agents');
    startServer(engine);
    return;
  }

  console.log('LLM: openrouter (openai/gpt-oss-120b)');

  const queryLlm = wrapLlm(
    createSignal('openrouter', { apiKey: OPENROUTER_API_KEY, model: 'openai/gpt-oss-120b' }),
    'query-agent',
    onEvent,
  );
  const mapLlm = wrapLlm(
    createSignal('openrouter', { apiKey: OPENROUTER_API_KEY, model: 'openai/gpt-oss-120b' }),
    'mapping-agent',
    onEvent,
  );

  const queryJsonSchema = engine.getDslSchema();
  const generateDsl = createQueryDsl({ adapter, llm: queryLlm, schema, queryJsonSchema });
  const mapToShape = createShapeMapper(mapLlm);

  const fullEngine = createQueryEngine({
    adapter,
    onEvent,
    cache,
    embed,
    generateDsl,
    mapToShape,
  });
  await fullEngine.introspect();

  startServer(fullEngine);
};

const startServer = (engine: ReturnType<typeof createQueryEngine>) => {
  const app = new Hono();

  app.route('/api/customers/vex', vex({ engine, entities: ['customers'] }));
  app.route('/api/orders/vex', vex({ engine, entities: ['orders', 'order_items'] }));
  app.route('/api/products/vex', vex({ engine, entities: ['products', 'categories', 'reviews'] }));
  app.route('/api/vex', vex({ engine }));

  app.get('/', (c) =>
    c.json({
      name: '@niscorp/vex dev server',
      endpoints: [
        { path: '/api/customers/vex', entities: ['customers'] },
        { path: '/api/orders/vex', entities: ['orders', 'order_items'] },
        { path: '/api/products/vex', entities: ['products', 'categories', 'reviews'] },
        { path: '/api/vex', entities: 'all' },
      ],
      usage: 'GET any endpoint for discovery, POST to query',
    }),
  );

  serve({ fetch: app.fetch, port: PORT }, () => {
    console.log(`\nVex dev server on http://localhost:${PORT}`);
    console.log(`Debug log: ${LOG_FILE}\n`);
  });
};

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
