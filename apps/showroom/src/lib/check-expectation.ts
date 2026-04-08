import type { RenderNode } from '@niscorp/nova';

export type StoryExpectation = {
  textIncludes?: string[];
  componentCount?: number;
  textNodeCount?: number;
};

export type ExpectationResult =
  | { ok: true }
  | { ok: false; reasons: string[] };

export const collectText = (nodes: RenderNode[]): string => {
  let out = '';
  nodes.forEach((n) => {
    if (n.type === 'text') {
      out += n.value;
    } else if (n.type === 'fragment') {
      out += collectText(n.children);
    } else if (n.type === 'component') {
      out += collectText(n.children);
    }
  });
  return out;
};

export type TypeCounts = { component: number; text: number };

export const countByType = (nodes: RenderNode[]): TypeCounts => {
  let component = 0;
  let text = 0;
  const walk = (list: RenderNode[]): void => {
    list.forEach((n) => {
      if (n.type === 'component') {
        component += 1;
        walk(n.children);
      } else if (n.type === 'text') {
        text += 1;
      } else if (n.type === 'fragment') {
        walk(n.children);
      }
    });
  };
  walk(nodes);
  return { component, text };
};

export const checkExpectation = (
  tree: RenderNode[],
  expected: StoryExpectation | undefined,
): ExpectationResult => {
  if (expected === undefined) return { ok: true };
  const reasons: string[] = [];
  if (expected.textIncludes !== undefined) {
    const text = collectText(tree);
    expected.textIncludes.forEach((needle) => {
      if (!text.includes(needle)) {
        reasons.push(`textIncludes: missing substring "${needle}"`);
      }
    });
  }
  if (
    expected.componentCount !== undefined ||
    expected.textNodeCount !== undefined
  ) {
    const counts = countByType(tree);
    if (
      expected.componentCount !== undefined &&
      counts.component !== expected.componentCount
    ) {
      reasons.push(
        `componentCount mismatch: expected ${expected.componentCount}, got ${counts.component}`,
      );
    }
    if (
      expected.textNodeCount !== undefined &&
      counts.text !== expected.textNodeCount
    ) {
      reasons.push(
        `textNodeCount mismatch: expected ${expected.textNodeCount}, got ${counts.text}`,
      );
    }
  }
  if (reasons.length === 0) return { ok: true };
  return { ok: false, reasons };
};
