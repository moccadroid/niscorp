import { ConfigSchema } from '../schemas/config.schema';
import { PrismError, ErrorCode } from '../errors';
import { desugar } from '../sugar/desugar';
import type { CompileOptions, CompiledIr, JsonValue } from '../types';
import { isJsonObject } from '../schemas/guards';

// ═══════════════════════════════════════════════════════════
// Tree Walker — collects stats in a single pass
// ═══════════════════════════════════════════════════════════

type WalkStats = {
  nodeCount: number;
  maxDepth: number;
  opCount: Record<string, number>;
  paths: Set<string>;
  strings: Set<string>;
};

const walk = (node: unknown, stats: WalkStats, depth: number): void => {
  stats.nodeCount++;
  if (depth > stats.maxDepth) stats.maxDepth = depth;

  if (node === null || node === undefined) return;
  if (typeof node === 'string') {
    stats.strings.add(node);
    return;
  }
  if (typeof node === 'number' || typeof node === 'boolean') return;

  if (Array.isArray(node)) {
    for (const child of node) walk(child, stats, depth + 1);
    return;
  }

  if (!isJsonObject(node)) return;

  // Detect op and count
  for (const key of Object.keys(node)) {
    if (key.startsWith('$')) {
      stats.opCount[key] = (stats.opCount[key] ?? 0) + 1;
    }
  }

  // Capture $ref paths
  if ('$ref' in node && typeof node['$ref'] === 'string') {
    stats.paths.add(node['$ref']);
    stats.strings.add(node['$ref']);
  }

  // Recurse into all values
  for (const value of Object.values(node)) {
    walk(value, stats, depth + 1);
  }
};

// ═══════════════════════════════════════════════════════════
// SHA256 fingerprint
// ═══════════════════════════════════════════════════════════

const hashSha256 = async (data: string): Promise<string> => {
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

// ═══════════════════════════════════════════════════════════
// Compile
// ═══════════════════════════════════════════════════════════

export const compile = async (
  config: unknown,
  options?: CompileOptions,
): Promise<CompiledIr> => {
  // Validate
  const parsed = ConfigSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new PrismError(`Invalid config: ${issues}`, ErrorCode.SCHEMA);
  }

  // Desugar
  const core = desugar(parsed.data);

  // Walk for stats
  const stats: WalkStats = {
    nodeCount: 0,
    maxDepth: 0,
    opCount: {},
    paths: new Set(),
    strings: new Set(),
  };
  walk(core, stats, 0);

  // Fingerprint
  const fingerprint = await hashSha256(JSON.stringify(core));

  return {
    irVersion: 1,
    compiler: {
      name: '@niscorp/prism',
      version: options?.version ?? 'dev',
    },
    meta: {
      name: options?.name,
      createdAt: new Date().toISOString(),
      fingerprint,
      stats: {
        nodeCount: stats.nodeCount,
        opCount: stats.opCount,
        maxDepth: stats.maxDepth,
      },
    },
    tables: {
      paths: Array.from(stats.paths),
      strings: Array.from(stats.strings),
    },
    core: core as JsonValue,
  };
};
