import type { JsonObject, JsonValue } from '../types';
import type { RefNode } from './ops/core.schema';
import type { ConstNode, VarNode, GetNode, WithNode } from './ops/core.schema';
import type { MapNode, FilterNode, ReduceNode, SliceNode, FlattenNode, UniqueNode, SortByNode } from './ops/array.schema';
import type { AddNode, SubNode, MulNode, DivNode, RoundNode } from './ops/math.schema';
import type { JoinNode, ToStringNode, InterpolateNode, TrimNode, LowerNode, UpperNode, SplitNode, ReplaceNode } from './ops/string.schema';
import type { EqNode, NeqNode, GtNode, GteNode, LtNode, LteNode, EmptyNode, StartsWithNode, EndsWithNode, ContainsNode } from './ops/predicate.schema';
import type { NotNode, AndNode, OrNode } from './ops/logic.schema';
import type { MergeNode, CoalesceNode, CaseNode, EntriesOfNode, KeyByNode, GroupByNode } from './ops/structure.schema';
import type { KeysNode, ValuesNode, FromEntriesNode, PickNode, OmitNode, TypeNode, LengthNode } from './ops/object.schema';
import type { DateNode, DateAddNode, DateDiffNode } from './ops/time.schema';
import type {
  SumNode, AvgNode, CountNode, MinNode, MaxNode,
  PluckNode, TakeNode, DropNode, MatchNode, FlatMapNode,
} from './ops/sugar.schema';

// ═══════════════════════════════════════════════════════════
// Generic helpers
// ═══════════════════════════════════════════════════════════

const hasKey = (value: unknown, key: string): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && key in value;

export const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isJsonArray = (value: unknown): value is JsonValue[] =>
  Array.isArray(value);

// ═══════════════════════════════════════════════════════════
// Core op guards
// ═══════════════════════════════════════════════════════════

export const isRefNode = (v: unknown): v is RefNode => hasKey(v, '$ref');
export const isConstNode = (v: unknown): v is ConstNode => hasKey(v, '$const');
export const isVarNode = (v: unknown): v is VarNode => hasKey(v, '$var');
export const isGetNode = (v: unknown): v is GetNode => hasKey(v, '$get');
export const isWithNode = (v: unknown): v is WithNode => hasKey(v, '$with');

// ═══════════════════════════════════════════════════════════
// Array op guards
// ═══════════════════════════════════════════════════════════

export const isMapNode = (v: unknown): v is MapNode => hasKey(v, '$map');
export const isFilterNode = (v: unknown): v is FilterNode => hasKey(v, '$filter');
export const isReduceNode = (v: unknown): v is ReduceNode => hasKey(v, '$reduce');
export const isSliceNode = (v: unknown): v is SliceNode => hasKey(v, '$slice');
export const isFlattenNode = (v: unknown): v is FlattenNode => hasKey(v, '$flatten');
export const isUniqueNode = (v: unknown): v is UniqueNode => hasKey(v, '$unique');
export const isSortByNode = (v: unknown): v is SortByNode => hasKey(v, '$sortBy');

// ═══════════════════════════════════════════════════════════
// Math op guards
// ═══════════════════════════════════════════════════════════

export const isAddNode = (v: unknown): v is AddNode => hasKey(v, '$add');
export const isSubNode = (v: unknown): v is SubNode => hasKey(v, '$sub');
export const isMulNode = (v: unknown): v is MulNode => hasKey(v, '$mul');
export const isDivNode = (v: unknown): v is DivNode => hasKey(v, '$div');
export const isRoundNode = (v: unknown): v is RoundNode => hasKey(v, '$round');

// ═══════════════════════════════════════════════════════════
// String op guards
// ═══════════════════════════════════════════════════════════

export const isJoinNode = (v: unknown): v is JoinNode => hasKey(v, '$join');
export const isToStringNode = (v: unknown): v is ToStringNode => hasKey(v, '$toString');
export const isInterpolateNode = (v: unknown): v is InterpolateNode => hasKey(v, '$interpolate');
export const isTrimNode = (v: unknown): v is TrimNode => hasKey(v, '$trim');
export const isLowerNode = (v: unknown): v is LowerNode => hasKey(v, '$lower');
export const isUpperNode = (v: unknown): v is UpperNode => hasKey(v, '$upper');
export const isSplitNode = (v: unknown): v is SplitNode => hasKey(v, '$split');
export const isReplaceNode = (v: unknown): v is ReplaceNode => hasKey(v, '$replace');

// ═══════════════════════════════════════════════════════════
// Predicate op guards
// ═══════════════════════════════════════════════════════════

export const isEqNode = (v: unknown): v is EqNode => hasKey(v, '$eq');
export const isNeqNode = (v: unknown): v is NeqNode => hasKey(v, '$neq');
export const isGtNode = (v: unknown): v is GtNode => hasKey(v, '$gt');
export const isGteNode = (v: unknown): v is GteNode => hasKey(v, '$gte');
export const isLtNode = (v: unknown): v is LtNode => hasKey(v, '$lt');
export const isLteNode = (v: unknown): v is LteNode => hasKey(v, '$lte');
export const isEmptyNode = (v: unknown): v is EmptyNode => hasKey(v, '$empty');
export const isStartsWithNode = (v: unknown): v is StartsWithNode => hasKey(v, '$startsWith');
export const isEndsWithNode = (v: unknown): v is EndsWithNode => hasKey(v, '$endsWith');
export const isContainsNode = (v: unknown): v is ContainsNode => hasKey(v, '$contains');

// ═══════════════════════════════════════════════════════════
// Logic op guards
// ═══════════════════════════════════════════════════════════

export const isNotNode = (v: unknown): v is NotNode => hasKey(v, '$not');
export const isAndNode = (v: unknown): v is AndNode => hasKey(v, '$and');
export const isOrNode = (v: unknown): v is OrNode => hasKey(v, '$or');

// ═══════════════════════════════════════════════════════════
// Structure op guards
// ═══════════════════════════════════════════════════════════

export const isMergeNode = (v: unknown): v is MergeNode => hasKey(v, '$merge');
export const isCoalesceNode = (v: unknown): v is CoalesceNode => hasKey(v, '$coalesce');
export const isCaseNode = (v: unknown): v is CaseNode => hasKey(v, '$case');
export const isEntriesOfNode = (v: unknown): v is EntriesOfNode => hasKey(v, '$entriesOf');
export const isKeyByNode = (v: unknown): v is KeyByNode => hasKey(v, '$keyBy');
export const isGroupByNode = (v: unknown): v is GroupByNode => hasKey(v, '$groupBy');

// ═══════════════════════════════════════════════════════════
// Object op guards
// ═══════════════════════════════════════════════════════════

export const isKeysNode = (v: unknown): v is KeysNode => hasKey(v, '$keys');
export const isValuesNode = (v: unknown): v is ValuesNode => hasKey(v, '$values');
export const isFromEntriesNode = (v: unknown): v is FromEntriesNode => hasKey(v, '$fromEntries');
export const isPickNode = (v: unknown): v is PickNode => hasKey(v, '$pick');
export const isOmitNode = (v: unknown): v is OmitNode => hasKey(v, '$omit');
export const isTypeNode = (v: unknown): v is TypeNode => hasKey(v, '$type');
export const isLengthNode = (v: unknown): v is LengthNode => hasKey(v, '$length');

// ═══════════════════════════════════════════════════════════
// Time op guards
// ═══════════════════════════════════════════════════════════

export const isDateNode = (v: unknown): v is DateNode => hasKey(v, '$date');
export const isDateAddNode = (v: unknown): v is DateAddNode => hasKey(v, '$dateAdd');
export const isDateDiffNode = (v: unknown): v is DateDiffNode => hasKey(v, '$dateDiff');

// ═══════════════════════════════════════════════════════════
// Sugar op guards
// ═══════════════════════════════════════════════════════════

export const isSumNode = (v: unknown): v is SumNode => hasKey(v, '$sum');
export const isAvgNode = (v: unknown): v is AvgNode => hasKey(v, '$avg');
export const isCountNode = (v: unknown): v is CountNode => hasKey(v, '$count');
export const isMinNode = (v: unknown): v is MinNode => hasKey(v, '$min');
export const isMaxNode = (v: unknown): v is MaxNode => hasKey(v, '$max');
export const isPluckNode = (v: unknown): v is PluckNode => hasKey(v, '$pluck');
export const isTakeNode = (v: unknown): v is TakeNode => hasKey(v, '$take');
export const isDropNode = (v: unknown): v is DropNode => hasKey(v, '$drop');
export const isMatchNode = (v: unknown): v is MatchNode => hasKey(v, '$match');
export const isFlatMapNode = (v: unknown): v is FlatMapNode => hasKey(v, '$flatMap');

// ═══════════════════════════════════════════════════════════
// Plain object detection
// ═══════════════════════════════════════════════════════════

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  isJsonObject(value) && !Object.keys(value).some((k) => k.startsWith('$'));
