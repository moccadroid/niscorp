import {
  isSumNode, isAvgNode, isCountNode, isMinNode, isMaxNode,
  isPluckNode, isTakeNode, isDropNode, isMatchNode, isFlatMapNode,
  isConstNode, isWithNode, isRenameKeysNode,
  isJsonObject,
} from '../schemas/guards';
import {
  rewriteSum, rewriteAvg, rewriteCount, rewriteMin, rewriteMax,
  rewritePluck, rewriteTake, rewriteDrop, rewriteMatch, rewriteFlatMap,
} from './rewriters';

export const desugar = (node: unknown): unknown => {
  if (node === null || node === undefined) return node;
  if (typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(desugar);

  // Three places hold a `$` key that is a name or data, not a node: a `$with`
  // binding, a `$renameKeys` map, a `$const` payload. A sugar op's name there
  // is not rewritten.
  if (isWithNode(node)) {
    const bindings: Record<string, unknown> = {};
    for (const [name, expr] of Object.entries(node.$with.let)) bindings[name] = desugar(expr);
    return { $with: { let: bindings, value: desugar(node.$with.value) } };
  }
  if (isRenameKeysNode(node)) return { $renameKeys: { ...node.$renameKeys, from: desugar(node.$renameKeys.from) } };
  if (isConstNode(node)) return node;

  if (isSumNode(node)) return rewriteSum(node, desugar);
  if (isAvgNode(node)) return rewriteAvg(node, desugar);
  if (isCountNode(node)) return rewriteCount(node, desugar);
  if (isMinNode(node)) return rewriteMin(node, desugar);
  if (isMaxNode(node)) return rewriteMax(node, desugar);
  if (isPluckNode(node)) return rewritePluck(node, desugar);
  if (isTakeNode(node)) return rewriteTake(node, desugar);
  if (isDropNode(node)) return rewriteDrop(node, desugar);
  if (isMatchNode(node)) return rewriteMatch(node, desugar);
  if (isFlatMapNode(node)) return rewriteFlatMap(node, desugar);

  if (isJsonObject(node)) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      result[key] = desugar(value);
    }
    return result;
  }

  return node;
};
