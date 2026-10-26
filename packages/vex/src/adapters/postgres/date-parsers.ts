export type TypeParsers = Record<number, (value: string) => unknown>;

const RAW = (value: string): string => value;

// OIDs: DATE is 1082, TIMESTAMPTZ is 1184. Not for a pool handed to the vex
// cache, which reads its timestamp columns as Dates.
export const RAW_DATE_PARSERS: TypeParsers = { 1082: RAW, 1184: RAW };
