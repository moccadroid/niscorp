import type { FC } from 'react';
import { INK, MONO } from '@showroom/chrome/stage/ui';

// ═══════════════════════════════════════════════════════════
// Prism's small shared parts on the stage language: a light JSON block, a
// one-line description of a value's shape, and the operators a config uses.
// Presentation only — evaluation is prism-view.tsx's job.
// ═══════════════════════════════════════════════════════════

export const Block: FC<{ children: string; tone?: 'plain' | 'ok' | 'bad'; maxHeight?: number }> = ({ children, tone = 'plain', maxHeight = 380 }) => (
  <pre
    style={{
      margin: 0,
      padding: '10px 12px',
      borderRadius: 10,
      background: tone === 'bad' ? INK.badWash : tone === 'ok' ? INK.okWash : INK.wash,
      color: tone === 'bad' ? '#991b1b' : tone === 'ok' ? '#064e3b' : INK.text,
      border: `1px solid ${tone === 'bad' ? '#fecaca' : tone === 'ok' ? '#a7f3d0' : INK.line}`,
      fontFamily: MONO,
      fontSize: 11.5,
      lineHeight: 1.55,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      overflow: 'auto',
      maxHeight,
    }}
  >
    {children}
  </pre>
);

export const json = (v: unknown): string => JSON.stringify(v, null, 2) ?? String(v);

// "3 items", "4 keys", "text", "number" — what a value is, in two words.
export const shapeOf = (v: unknown): string => {
  if (Array.isArray(v)) return `list · ${v.length} item${v.length === 1 ? '' : 's'}`;
  if (v === null) return 'null';
  if (typeof v === 'object') {
    const n = Object.keys(v).length;
    return `object · ${n} key${n === 1 ? '' : 's'}`;
  }
  if (typeof v === 'string') return 'text';
  return typeof v;
};

// Every `$op` key a config uses, in first-seen order.
export const opsOf = (config: unknown): string[] => {
  const seen = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node)) {
      if (k.startsWith('$')) seen.add(k);
      walk(v);
    }
  };
  walk(config);
  return [...seen];
};
