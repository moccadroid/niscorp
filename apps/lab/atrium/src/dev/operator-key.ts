// Imported FIRST by admin-check, BEFORE `./world` — the same trick as
// `no-llm.ts`, for a reason worth writing down.
//
// There are two gates on `/operator/*`. This app mounts one that reads
// `process.env.OPERATOR_KEY` per request, and moss mounts one that reads
// `runtime.operatorKey`, captured when the runtime is BUILT. moss's is
// registered first, so its answer is the only one that runs.
//
// That makes the key a boot-time input, not a request-time one. A check that
// set it in its own module body set it after the import graph had already
// booted the world, so the runtime captured an empty string and every operator
// path answered 404 — with the right key, from the right caller.
//
// Setting it here, in a module the check imports ahead of the world, is what
// makes it true before the runtime reads it.
process.env['OPERATOR_KEY'] = 'check-operator-key';

export const OPERATOR_KEY = 'check-operator-key';
