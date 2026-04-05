// Schemas
export { NodeSchema, OP_KEYS, OPTIONAL_FIELDS_KEY } from './node.schema';
export { ConfigSchema, type Config } from './config.schema';
export { JsonPrimitiveSchema, JsonValueSchema, JsonObjectSchema } from './json.schema';

// Core op schemas + types
export { RefNodeSchema, ConstNodeSchema, VarNodeSchema, GetNodeSchema, WithNodeSchema } from './ops/core.schema';
export type { RefNode, ConstNode, VarNode, GetNode, WithNode } from './ops/core.schema';

// Array op schemas + types
export { MapNodeSchema, FilterNodeSchema, ReduceNodeSchema, SliceNodeSchema, FlattenNodeSchema, UniqueNodeSchema, SortByNodeSchema } from './ops/array.schema';
export type { MapNode, FilterNode, ReduceNode, SliceNode, FlattenNode, UniqueNode, SortByNode } from './ops/array.schema';

// Math op schemas + types
export { AddNodeSchema, SubNodeSchema, MulNodeSchema, DivNodeSchema, RoundNodeSchema } from './ops/math.schema';
export type { AddNode, SubNode, MulNode, DivNode, RoundNode } from './ops/math.schema';

// String op schemas + types
export { JoinNodeSchema, ToStringNodeSchema, InterpolateNodeSchema, TrimNodeSchema, LowerNodeSchema, UpperNodeSchema, SplitNodeSchema, ReplaceNodeSchema } from './ops/string.schema';
export type { JoinNode, ToStringNode, InterpolateNode, TrimNode, LowerNode, UpperNode, SplitNode, ReplaceNode } from './ops/string.schema';

// Predicate op schemas + types
export { EqNodeSchema, NeqNodeSchema, GtNodeSchema, GteNodeSchema, LtNodeSchema, LteNodeSchema, EmptyNodeSchema, StartsWithNodeSchema, EndsWithNodeSchema, ContainsNodeSchema } from './ops/predicate.schema';
export type { EqNode, NeqNode, GtNode, GteNode, LtNode, LteNode, EmptyNode, StartsWithNode, EndsWithNode, ContainsNode } from './ops/predicate.schema';

// Logic op schemas + types
export { NotNodeSchema, AndNodeSchema, OrNodeSchema } from './ops/logic.schema';
export type { NotNode, AndNode, OrNode } from './ops/logic.schema';

// Structure op schemas + types
export { MergeNodeSchema, CoalesceNodeSchema, CaseNodeSchema, EntriesOfNodeSchema, KeyByNodeSchema, GroupByNodeSchema } from './ops/structure.schema';
export type { MergeNode, CoalesceNode, CaseNode, EntriesOfNode, KeyByNode, GroupByNode } from './ops/structure.schema';

// Object op schemas + types
export { KeysNodeSchema, ValuesNodeSchema, FromEntriesNodeSchema, PickNodeSchema, OmitNodeSchema, TypeNodeSchema, LengthNodeSchema } from './ops/object.schema';
export type { KeysNode, ValuesNode, FromEntriesNode, PickNode, OmitNode, TypeNode, LengthNode } from './ops/object.schema';

// Time op schemas + types
export { DateNodeSchema, DateAddNodeSchema, DateDiffNodeSchema } from './ops/time.schema';
export type { DateNode, DateAddNode, DateDiffNode } from './ops/time.schema';

// Sugar op schemas + types
export { SumNodeSchema, AvgNodeSchema, CountNodeSchema, MinNodeSchema, MaxNodeSchema, PluckNodeSchema, TakeNodeSchema, DropNodeSchema, MatchNodeSchema, FlatMapNodeSchema } from './ops/sugar.schema';
export type { SumNode, AvgNode, CountNode, MinNode, MaxNode, PluckNode, TakeNode, DropNode, MatchNode, FlatMapNode } from './ops/sugar.schema';

// Guards
export * from './guards';
