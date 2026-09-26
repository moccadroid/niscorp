// The PGlite pool is vex's own (`@niscorp/vex/pglite`): the same two readings of
// one db — RAW_DATE_PARSERS for app reads (Prism formats the wire strings), none
// for the cache (it calls .getTime()) — plus the one thing this app's hand-rolled
// copy lacked, a pass-through `transaction`. strata's ledgered migrations need
// one connection per run and refuse a pool that cannot provide it.
export { createPglitePool, RAW_DATE_PARSERS } from '@niscorp/vex/pglite';
