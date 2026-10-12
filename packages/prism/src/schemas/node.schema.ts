import { z } from 'zod';

import { JsonPrimitiveSchema } from './json.schema';

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
  AddNodeSchema, SubNodeSchema, MulNodeSchema, DivNodeSchema, ModNodeSchema, RoundNodeSchema, ToNumberNodeSchema,
  setNodeSchema as setMathNode,
} from './ops/math.schema';
import {
  FillNodeSchema, JoinNodeSchema, ToStringNodeSchema, InterpolateNodeSchema, TrimNodeSchema,
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
import {
  HasNodeSchema, RenameKeysNodeSchema, UpdateNodeSchema, AssertNodeSchema, WalkNodeSchema,
  setNodeSchema as setTransformNode,
} from './ops/transform.schema';

export const OP_KEYS = [
  '$ref', '$const', '$var', '$get', '$with',
  '$map', '$filter', '$reduce', '$slice', '$flatten', '$unique', '$sortBy',
  '$add', '$sub', '$mul', '$div', '$mod', '$round', '$toNumber',
  '$fill', '$join', '$toString', '$interpolate', '$trim', '$lower', '$upper', '$split', '$replace',
  '$eq', '$neq', '$gt', '$gte', '$lt', '$lte', '$empty', '$startsWith', '$endsWith', '$contains',
  '$not', '$and', '$or',
  '$merge', '$coalesce', '$case', '$entriesOf', '$keyBy', '$groupBy',
  '$keys', '$values', '$fromEntries', '$pick', '$omit', '$type', '$length',
  '$date', '$dateAdd', '$dateDiff',
  '$localeDate', '$localeMoney', '$localeNumber',
  '$sum', '$avg', '$count', '$min', '$max',
  '$pluck', '$take', '$drop', '$match', '$flatMap',
  '$has', '$renameKeys', '$update', '$assert', '$walk',
] as const;

export const OPTIONAL_FIELDS_KEY = '__optional';

// Every `$` key is refused, not only the names of ops that exist: the
// evaluator's `isPlainObject` reads a template the same way, and a new op never
// takes a key a stored template was using.
const TEMPLATE_KEY = /^(?!\$)/;

const isOpKey = (key: unknown): boolean => OP_KEYS.some((op) => op === key);

const templateKeyRefusal = (key: unknown): string =>
  isOpKey(key)
    ? 'An op name cannot be a plain object key. Use the op itself.'
    : 'Not a Prism op. A key that starts with "$" names an op; data with such a key goes in $const.';

const hasValidOptionalMeta = (obj: Record<string, unknown>): boolean => {
  const meta = obj[OPTIONAL_FIELDS_KEY];
  if (meta === undefined) return true;
  if (!Array.isArray(meta)) return false;
  return meta.every((f) => typeof f === 'string' && f.length > 0);
};

const NodeArraySchema = z.array(z.lazy(() => NodeSchema));

// The `$` rule is in the key schema, not a refinement: a refinement leaves this
// branch structurally matched, and zod then reports its complaint instead of
// the union's. A key pattern is also plain JSON Schema (`propertyNames`), which
// the grammar snapshot and agent prompts read.
const TemplateSchema = z
  .record(z.string().regex(TEMPLATE_KEY, { error: (issue) => templateKeyRefusal(issue.input) }), z.lazy(() => NodeSchema))
  .refine((o) => hasValidOptionalMeta(o), { message: '__optional must be an array of non-empty field name strings.' });

// zod tries a union's members in order and builds every failure's issues on
// the way, so the one member a value can be, by its keys, is tried first. Two
// passes, never a fallback at each node: that would walk a failing subtree
// twice at every level above it. zod's discriminated union does not fit: it
// dispatches on one key's value, and ops differ by which key is there.
type Member = z.core.$ZodType;

const opMembersOf = (options: readonly Member[]): Map<string, Member> => {
  const members = new Map<string, Member>();
  for (const option of options) {
    const { def } = option._zod;
    const keys = 'shape' in def && typeof def.shape === 'object' && def.shape !== null ? Object.keys(def.shape) : [];
    const [key] = keys;
    if (keys.length === 1 && key !== undefined && isOpKey(key)) members.set(key, option);
  }
  return members;
};

const memberOf = (value: unknown, ops: Map<string, Member>): Member | undefined => {
  if (value === null || typeof value !== 'object') return JsonPrimitiveSchema;
  if (Array.isArray(value)) return NodeArraySchema;
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return undefined;
  let op: string | undefined;
  let count = 0;
  for (const key in value) {
    count += 1;
    if (key.startsWith('$')) op = key;
  }
  if (op === undefined) return TemplateSchema;
  return count === 1 ? ops.get(op) : undefined;
};

const quick = new WeakSet<object>();
const walking = new WeakSet<object>();

const NodeUnion = z.core.$constructor<z.ZodUnion>('PrismNodeUnion', (inst, def) => {
  z.ZodUnion.init(inst, def);
  const ops = opMembersOf(def.options);
  const walk = inst._zod.parse;
  inst._zod.parse = (payload, ctx) => {
    if (ctx.async !== false || walking.has(ctx)) return walk(payload, ctx);
    const member = memberOf(payload.value, ops);
    // Inside a quick pass: a failure is only a no, the walk will say why.
    if (quick.has(ctx)) {
      if (member !== undefined) return member._zod.run(payload, ctx);
      payload.issues.push({ code: 'custom', input: payload.value, inst });
      return payload;
    }
    if (member !== undefined) {
      // A context of its own: zod keeps what a parse has answered on the
      // context, and the walk must not be handed the quick pass's answers.
      const own = { async: false as const, ...(ctx.jitless === undefined ? {} : { jitless: ctx.jitless }) };
      quick.add(own);
      const tried = member._zod.run({ value: payload.value, issues: [] }, own);
      if (!(tried instanceof Promise) && tried.issues.length === 0) return tried;
    }
    walking.add(ctx);
    try {
      return walk(payload, ctx);
    } finally {
      walking.delete(ctx);
    }
  };
});

export const NodeSchema: z.ZodType<unknown> = z.lazy(
  (): z.ZodTypeAny =>
    new NodeUnion({ type: 'union', options: [
      RefNodeSchema, ConstNodeSchema, VarNodeSchema, GetNodeSchema, WithNodeSchema,
      MapNodeSchema, FilterNodeSchema, ReduceNodeSchema, SliceNodeSchema,
      FlattenNodeSchema, UniqueNodeSchema, SortByNodeSchema,
      AddNodeSchema, SubNodeSchema, MulNodeSchema, DivNodeSchema, ModNodeSchema, RoundNodeSchema, ToNumberNodeSchema,
      FillNodeSchema, JoinNodeSchema, ToStringNodeSchema, InterpolateNodeSchema, TrimNodeSchema,
      LowerNodeSchema, UpperNodeSchema, SplitNodeSchema, ReplaceNodeSchema,
      EqNodeSchema, NeqNodeSchema, GtNodeSchema, GteNodeSchema,
      LtNodeSchema, LteNodeSchema, EmptyNodeSchema,
      StartsWithNodeSchema, EndsWithNodeSchema, ContainsNodeSchema,
      NotNodeSchema, AndNodeSchema, OrNodeSchema,
      MergeNodeSchema, CoalesceNodeSchema, CaseNodeSchema, EntriesOfNodeSchema,
      KeyByNodeSchema, GroupByNodeSchema,
      KeysNodeSchema, ValuesNodeSchema, FromEntriesNodeSchema,
      PickNodeSchema, OmitNodeSchema, TypeNodeSchema, LengthNodeSchema,
      DateNodeSchema, DateAddNodeSchema, DateDiffNodeSchema,
      LocaleDateNodeSchema, LocaleMoneyNodeSchema, LocaleNumberNodeSchema,
      SumNodeSchema, AvgNodeSchema, CountNodeSchema, MinNodeSchema, MaxNodeSchema,
      PluckNodeSchema, TakeNodeSchema, DropNodeSchema, MatchNodeSchema, FlatMapNodeSchema,
      HasNodeSchema, RenameKeysNodeSchema, UpdateNodeSchema, AssertNodeSchema, WalkNodeSchema,
      JsonPrimitiveSchema,
      NodeArraySchema,
      TemplateSchema,
    ] }).describe('A Prism node: an op, a plain JSON value, an array of nodes, or a plain object template.'),
);

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
setTransformNode(NodeSchema);
