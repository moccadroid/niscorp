// Imported FIRST by every check that works the operator seam — BEFORE `./world`,
// and before the integrations service, whose module load reads `.env`.
//
// THE KEY IS A BOOT-TIME INPUT. `devRuntime` reads `process.env.OPERATOR_KEY`
// when it builds the runtime (server/runtime.ts), and moss reads
// `runtime.operatorKey` ONCE, when `createServer` mounts the operator prefix
// (guardOperator, packages/moss/src/server.ts). Nothing consults either again.
//
// These checks used to write `runtime.operatorKey = KEY` in their own module
// body, which is after the import graph has booted the world. That worked
// while moss read the field on every request; since the gate became
// `guardOperator`, a key assigned after boot is a key nobody reads — the
// runtime was built with none, "the seam does not exist" was the standing
// answer, and every operator path said 404 to the right key from the right
// caller.
//
// Setting it here, in a module the check imports ahead of the world, is what
// makes it true before the runtime is built. Assigned rather than defaulted, so
// a key in a developer's shell or `.env` cannot stand in for this one.
process.env['OPERATOR_KEY'] = 'lab-operator-key';

export const OPERATOR_KEY = 'lab-operator-key';
