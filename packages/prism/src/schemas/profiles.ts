import type { OP_KEYS } from './node.schema';

export type OpKey = (typeof OP_KEYS)[number];

export const MAPPING_OPS: readonly OpKey[] = [
  '$ref', '$const', '$var', '$get', '$with',
  '$map', '$filter', '$reduce', '$slice', '$unique', '$sortBy', '$take', '$pluck',
  '$add', '$sub', '$mul', '$div', '$mod', '$round', '$toNumber', '$sum', '$avg', '$count', '$min', '$max',
  '$join', '$toString', '$interpolate', '$trim', '$lower', '$upper', '$split',
  '$eq', '$neq', '$gt', '$gte', '$lt', '$lte', '$empty', '$contains', '$not', '$and', '$or',
  '$merge', '$coalesce', '$case', '$groupBy', '$pick', '$omit', '$length',
  '$date', '$dateDiff', '$localeDate', '$localeMoney', '$localeNumber',
];
