---
"@niscorp/nova": patch
---

`shellIdle(shell, { waitMs?, stopped? })` — a wait for what a press set going.

`shellSettled` answers once nothing is mounting. That is the first screen being whole, and it says nothing about what happens afterwards: a trigger's steps run detached from the event that fired them, so after `dispatch` it can answer `true` while the call the press made is still out. Anything that pressed and then read the screen had to sleep.

`shellIdle` resolves `true` once nothing is mounting **and** no chain the shell started is still running: no trigger's steps, no `emit` on its way to its listeners and what they then call, no hook a navigation started — including the re-read of an action a `pop` reveals, which runs while that action is already `active`. It takes the options `shellSettled` takes, with the same default wait, and resolves `false` when the wait runs out.

```ts
shell.dispatch({ type: 'ui:click', ref: 'save', origin });
await shellIdle(shell, { waitMs: 5000 });   // the call has answered, and what it chained to has run
```

It is about the shell's own work. It does not wait for the next body of a read the shell is following (a reactive read answers again when somebody else writes; `shell.onDataChange` says when), nor for anything outside the shell that an endpoint set going. A call that never answers holds it until the call's own timeout fails it.

`shellSettled` is unchanged, and still asks about mounts alone: a page is read whenever it is asked for, also while a long call is out, and that read should not wait on it.

`ActionRuntimeConfig` gains an optional `onChain`, which is how a runtime reports what it starts and does not await; a shell made by `createShell` wires it.

**What to change:** nothing. A check that slept after a press can await `shellIdle` instead.
