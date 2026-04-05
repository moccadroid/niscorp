import {
  isSumNode, isAvgNode, isCountNode, isMinNode, isMaxNode,
  isPluckNode, isTakeNode, isDropNode, isMatchNode, isFlatMapNode,
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

  // Sugar ops
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

  // Deep traversal for plain objects and op objects
  if (isJsonObject(node)) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      result[key] = desugar(value);
    }
    return result;
  }

  return node;
};
