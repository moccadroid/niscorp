import type {
  SumNode, AvgNode, CountNode, MinNode, MaxNode,
  PluckNode, TakeNode, DropNode, MatchNode, FlatMapNode,
} from '../schemas';

type Recurse = (node: unknown) => unknown;

export const rewriteSum = (node: SumNode, recurse: Recurse): unknown => ({
  $reduce: {
    over: recurse(node.$sum.over),
    as: '__x',
    acc: '__acc',
    init: { $const: 0 },
    body: { $add: [{ $var: '__acc' }, { $var: '__x' }] },
  },
});

export const rewriteCount = (node: CountNode, recurse: Recurse): unknown => ({
  $reduce: {
    over: recurse(node.$count.over),
    as: '__x',
    acc: '__acc',
    init: { $const: 0 },
    body: { $add: [{ $var: '__acc' }, { $const: 1 }] },
  },
});

export const rewriteAvg = (node: AvgNode, recurse: Recurse): unknown => {
  const over = recurse(node.$avg.over);
  return {
    $div: [
      {
        $reduce: {
          over,
          as: '__x',
          acc: '__acc',
          init: { $const: 0 },
          body: { $add: [{ $var: '__acc' }, { $var: '__x' }] },
        },
      },
      {
        $reduce: {
          over,
          as: '__x',
          acc: '__acc',
          init: { $const: 0 },
          body: { $add: [{ $var: '__acc' }, { $const: 1 }] },
        },
      },
    ],
  };
};

export const rewriteMin = (node: MinNode, recurse: Recurse): unknown => ({
  $reduce: {
    over: recurse(node.$min.over),
    as: '__x',
    acc: '__acc',
    init: { $const: null },
    body: {
      $case: {
        branches: [
          { when: { $eq: [{ $var: '__acc' }, null] }, then: { $var: '__x' } },
          { when: { $lt: [{ $var: '__x' }, { $var: '__acc' }] }, then: { $var: '__x' } },
        ],
        else: { $var: '__acc' },
      },
    },
  },
});

export const rewriteMax = (node: MaxNode, recurse: Recurse): unknown => ({
  $reduce: {
    over: recurse(node.$max.over),
    as: '__x',
    acc: '__acc',
    init: { $const: null },
    body: {
      $case: {
        branches: [
          { when: { $eq: [{ $var: '__acc' }, null] }, then: { $var: '__x' } },
          { when: { $gt: [{ $var: '__x' }, { $var: '__acc' }] }, then: { $var: '__x' } },
        ],
        else: { $var: '__acc' },
      },
    },
  },
});

export const rewritePluck = (node: PluckNode, recurse: Recurse): unknown => ({
  $map: {
    over: recurse(node.$pluck.over),
    as: '__item',
    body: { $get: { from: { $var: '__item' }, path: [node.$pluck.key] } },
  },
});

export const rewriteTake = (node: TakeNode, recurse: Recurse): unknown => ({
  $slice: {
    from: recurse(node.$take.from),
    start: 0,
    end: node.$take.count,
  },
});

export const rewriteDrop = (node: DropNode, recurse: Recurse): unknown => ({
  $slice: {
    from: recurse(node.$drop.from),
    start: node.$drop.count,
  },
});

export const rewriteMatch = (node: MatchNode, recurse: Recurse): unknown => ({
  $filter: {
    over: recurse(node.$match.over),
    as: node.$match.as,
    when: {
      $contains: {
        value: { $var: node.$match.as },
        search: recurse(node.$match.search),
      },
    },
  },
});

export const rewriteFlatMap = (node: FlatMapNode, recurse: Recurse): unknown => ({
  $flatten: {
    $map: {
      over: recurse(node.$flatMap.over),
      as: node.$flatMap.as,
      body: recurse(node.$flatMap.body),
    },
  },
});
