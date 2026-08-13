import { z } from 'zod';

import { JsonPrimitiveSchema } from './json.schema';

// ─────────────────────────────────────────────────────────
// Op schemas — imported for the union
// ───────────────────────────��─────────────────────────────

import {
  RefNodeSchema, ConstNodeSchema, VarNodeSchema, GetNodeSchema, WithNodeSchema,
  setNodeSchema as setCoreNode,
} from './ops/core.schema';
import {
  MapNodeSchema, FilterNodeSchema, ReduceNodeSchema, SliceNodeSchema,
  FlattenNodeSchema, UniqueNodeSchema, SortByNodeSchema,
  setNodeSchema as setArrayNode,
} from './ops/array.schema';
import {
  AddNodeSchema, SubNodeSchema, MulNodeSchema, DivNodeSchema, RoundNodeSchema,
  setNodeSchema as setMathNode,
} from './ops/math.schema';
import {
  JoinNodeSchema, ToStringNodeSchema, InterpolateNodeSchema, TrimNodeSchema,
  LowerNodeSchema, UpperNodeSchema, SplitNodeSchema, ReplaceNodeSchema,
  setNodeSchema as setStringNode,
} from './ops/string.schema';
import {
  EqNodeSchema, NeqNodeSchema, GtNodeSchema, GteNodeSchema,
  LtNodeSchema, LteNodeSchema, EmptyNodeSchema,
  StartsWithNodeSchema, EndsWithNodeSchema, ContainsNodeSchema,
  setNodeSchema as setPredicateNode,
} from './ops/predicate.schema';
import {
  NotNodeSchema, AndNodeSchema, OrNodeSchema,
  setNodeSchema as setLogicNode,
} from './ops/logic.schema';
import {
  MergeNodeSchema, CoalesceNodeSchema, CaseNodeSchema, EntriesOfNodeSchema,
  KeyByNodeSchema, GroupByNodeSchema,
  setNodeSchema as setStructureNode,
} from './ops/structure.schema';
import {
  KeysNodeSchema, ValuesNodeSchema, FromEntriesNodeSchema,
  PickNodeSchema, OmitNodeSchema, TypeNodeSchema, LengthNodeSchema,
  setNodeSchema as setObjectNode,
} from './ops/object.schema';
import {
  DateNodeSchema, DateAddNodeSchema, DateDiffNodeSchema,
  setNodeSchema as setTimeNode,
} from './ops/time.schema';
import {
  LocaleDateNodeSchema, LocaleMoneyNodeSchema, LocaleNumberNodeSchema,
  setNodeSchema as setIntlNode,
} from './ops/intl.schema';
import {
  SumNodeSchema, AvgNodeSchema, CountNodeSchema, MinNodeSchema, MaxNodeSchema,
  PluckNodeSchema, TakeNodeSchema, DropNodeSchema, MatchNodeSchema, FlatMapNodeSchema,
  setNodeSchema as setSugarNode,
} from './ops/sugar.schema';

// ═══���═══════════════════════════════════════════════════════
// Op keys — used by plain object detection
// ═══════════════���═══════════════════════════════════════════

export const OP_KEYS = [
  '$ref', '$const', '$var', '$get', '$with',
  '$map', '$filter', '$reduce', '$slice', '$flatten', '$unique', '$sortBy',
  '$add', '$sub', '$mul', '$div', '$round',
  '$join', '$toString', '$interpolate', '$trim', '$lower', '$upper', '$split', '$replace',
  '$eq', '$neq', '$gt', '$gte', '$lt', '$lte', '$empty', '$startsWith', '$endsWith', '$contains',
  '$not', '$and', '$or',
  '$merge', '$coalesce', '$case', '$entriesOf', '$keyBy', '$groupBy',
  '$keys', '$values', '$fromEntries', '$pick', '$omit', '$type', '$length',
  '$date', '$dateAdd', '$dateDiff',
  '$localeDate', '$localeMoney', '$localeNumber',
  '$sum', '$avg', '$count', '$min', '$max',
  '$pluck', '$take', '$drop', '$match', '$flatMap',
] as const;

export const OPTIONAL_FIELDS_KEY = '__optional';

// ═════��═════════════════════════════════════════════════════
// Plain object helpers
// ════════════════════��══════════════════════════════════════

const isOpKey = (key: string): boolean =>
  (OP_KEYS as readonly string[]).includes(key);

const hasOpKeys = (obj: Record<string, unknown>): boolean =>
  Object.keys(obj).some(isOpKey);

const hasValidOptionalMeta = (obj: Record<string, unknown>): boolean => {
  const meta = obj[OPTIONAL_FIELDS_KEY];
  if (meta === undefined) return true;
  if (!Array.isArray(meta)) return false;
  return meta.every((f) => typeof f === 'string' && f.length > 0);
};

// ═══════════════════════════════════════════════════════════
// NodeSchema — the big recursive union
// ══════════════════════════════════════════════════���════════

export const NodeSchema: z.ZodType<unknown> = z.lazy(
  (): z.ZodTypeAny =>
    z.union([
      // Core
      RefNodeSchema, ConstNodeSchema, VarNodeSchema, GetNodeSchema, WithNodeSchema,
      // Array
      MapNodeSchema, FilterNodeSchema, ReduceNodeSchema, SliceNodeSchema,
      FlattenNodeSchema, UniqueNodeSchema, SortByNodeSchema,
      // Math
      AddNodeSchema, SubNodeSchema, MulNodeSchema, DivNodeSchema, RoundNodeSchema,
      // String
      JoinNodeSchema, ToStringNodeSchema, InterpolateNodeSchema, TrimNodeSchema,
      LowerNodeSchema, UpperNodeSchema, SplitNodeSchema, ReplaceNodeSchema,
      // Predicates
      EqNodeSchema, NeqNodeSchema, GtNodeSchema, GteNodeSchema,
      LtNodeSchema, LteNodeSchema, EmptyNodeSchema,
      StartsWithNodeSchema, EndsWithNodeSchema, ContainsNodeSchema,
      // Logic
      NotNodeSchema, AndNodeSchema, OrNodeSchema,
      // Structure
      MergeNodeSchema, CoalesceNodeSchema, CaseNodeSchema, EntriesOfNodeSchema,
      KeyByNodeSchema, GroupByNodeSchema,
      // Object
      KeysNodeSchema, ValuesNodeSchema, FromEntriesNodeSchema,
      PickNodeSchema, OmitNodeSchema, TypeNodeSchema, LengthNodeSchema,
      // Time
      DateNodeSchema, DateAddNodeSchema, DateDiffNodeSchema,
      // Locale-aware formatting
      LocaleDateNodeSchema, LocaleMoneyNodeSchema, LocaleNumberNodeSchema,
      // Sugar
      SumNodeSchema, AvgNodeSchema, CountNodeSchema, MinNodeSchema, MaxNodeSchema,
      PluckNodeSchema, TakeNodeSchema, DropNodeSchema, MatchNodeSchema, FlatMapNodeSchema,
      // Primitives
      JsonPrimitiveSchema,
      // Arrays of nodes
      z.array(z.lazy(() => NodeSchema)),
      // Plain objects (no op keys, recursive values)
      z.record(z.string(), z.lazy(() => NodeSchema))
        .refine((o) => !hasOpKeys(o), { message: 'Plain object must not contain $ op keys. Use a specific op instead.' })
        .refine((o) => hasValidOptionalMeta(o), { message: '__optional must be an array of non-empty field name strings.' }),
    ]).describe('A Prism node: an op, a plain JSON value, an array of nodes, or a plain object template.'),
);

// ─────────────────��────────────────────��──────────────────
// Wire up forward references
// ─────────────────────────────────────────────────────────

setCoreNode(NodeSchema);
setArrayNode(NodeSchema);
setMathNode(NodeSchema);
setStringNode(NodeSchema);
setPredicateNode(NodeSchema);
setLogicNode(NodeSchema);
setStructureNode(NodeSchema);
setObjectNode(NodeSchema);
setTimeNode(NodeSchema);
setIntlNode(NodeSchema);
setSugarNode(NodeSchema);
