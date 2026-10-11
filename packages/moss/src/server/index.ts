// ═══════════════════════════════════════════════════════════════
// The server — the wiring, and nothing else.
//
// Moss answers five questions about a request, and each has one module that
// owns it: who is calling (../identity), what exists for them (../manifest),
// what they may read and write (../data), what they are looking at
// (../shells), and how it reaches them (../socket, ../documents). This module
// answers none of them. It constructs those modules, hands each the narrow
// things it needs, starts the features and mounts the routes.
//
// `createServer` (./server.ts) is the list of steps, each a function in a
// file beside it; the steps that stand over the data module are assembled in
// ./assemble.ts:
//
//   ./data.ts, ./manifest.ts, ./identity.ts   the three modules every surface asks
//   ./routes.ts          the server's own surfaces, in the order a request meets them
//   ./authenticate.ts    the authentication every route gets
//   ./hosts.ts           the shell hosts, the app's and each page's
//   ./wire.ts            the internal wire a server shell calls through
//   ./signals.ts         what crosses processes, over the fabric (./fabric.ts)
//   ./lanes.ts           what the app declared it wants to hear of a write: the reactions
//   ./features.ts        the seams a feature is started with
//   ./operator.ts        the operator prefix and its two gates
//   ./socket.ts          the socket, handed what it needs
//
// What comes out is a `MossServer` (./moss-server.ts): hono, and what moss adds.
//
// TWO FILES HERE ARE ENTRY POINTS OF THEIR OWN, and are not exported from this
// door, because the main entry must not carry a transport or a bundler:
//
//   ./node.ts   `@niscorp/moss/node`: the `ws` transport, the built site, `serve`
//   ./vite.ts   `@niscorp/moss/vite`: the app server inside vite's dev process
//
// and one file is what those two share and neither exports: ./transport.ts,
// the `ws` half of the transport seam.
//
// This module may import every core module. It imports no feature.
// ═══════════════════════════════════════════════════════════════

export type { MossServer } from './moss-server';
export { createServer } from './server';
