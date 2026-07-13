import type { EndpointConfig, Step, TriggerConfig } from '@niscorp/nova';

// Compact one-line renderings of Nova's declarative shapes, for the inspector's
// list rows. The full JSON is always one expand away — these just keep the
// scan-read cheap.

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const NAV_KEYS = ['push', 'replace', 'resetTo'] as const;
const MUTATION_KEYS = ['set', 'toggle', 'increment', 'decrement', 'push', 'pop', 'removeAt', 'move', 'clear', 'reset'] as const;

export const summarizeStep = (step: Step): string => {
  const record = step as Record<string, unknown>;

  if (typeof record['call'] === 'string') {
    const branches = [
      Array.isArray(record['onSuccess']) ? `✓${record['onSuccess'].length}` : '',
      Array.isArray(record['onError']) ? `✗${record['onError'].length}` : '',
    ]
      .filter(Boolean)
      .join(' ');
    return `call ${record['call']}${branches ? ` (${branches})` : ''}`;
  }
  if (isRecord(record['emit'])) return `emit ${String(record['emit']['channel'])}`;
  for (const key of NAV_KEYS) {
    const value = record[key];
    // Nav effects carry an object; the `push`/`pop` MUTATIONS carry a path string.
    if (isRecord(value) && typeof value['action'] === 'string') {
      const canvas = typeof value['canvas'] === 'string' ? `@${value['canvas']}` : '';
      const withs = Array.isArray(value['with']) ? ` with [${value['with'].join(', ')}]` : '';
      return `${key} ${value['action']}${canvas}${withs}`;
    }
  }
  if (isRecord(record['popTo'])) return `popTo ${String(record['popTo']['instance'])}`;
  if (record['pop'] === true) return 'pop';
  for (const key of MUTATION_KEYS) {
    if (typeof record[key] === 'string') {
      const value = 'value' in record ? ` ← ${previewValue(record['value'])}` : '';
      return `${key} ${record[key]}${value}`;
    }
  }
  return JSON.stringify(step).slice(0, 60);
};

export const summarizeTrigger = (trigger: TriggerConfig): { on: string; steps: string[] } => {
  const source = trigger.event !== undefined ? trigger.event : `msg:${(trigger as { message?: string }).message}`;
  const ref = trigger.ref !== undefined ? ` @${trigger.ref}` : '';
  return { on: `${source}${ref}`, steps: trigger.do.map(summarizeStep) };
};

export const summarizeEndpoint = (config: EndpointConfig): string => {
  const record = config as Record<string, unknown>;
  const target = typeof record['target'] === 'string' ? ` → $.${record['target']}` : '';
  if (typeof record['fn'] === 'string') return `fn ${record['fn']}${target}`;
  const method = typeof record['method'] === 'string' ? record['method'].toUpperCase() : 'GET';
  return `${method} ${String(record['url'])}${target}`;
};

export const previewValue = (value: unknown): string => {
  if (typeof value === 'string') return value.length > 24 ? `'${value.slice(0, 24)}…'` : `'${value}'`;
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.length}]`;
  if (isRecord(value)) return `{${Object.keys(value).slice(0, 3).join(', ')}${Object.keys(value).length > 3 ? '…' : ''}}`;
  return typeof value;
};
