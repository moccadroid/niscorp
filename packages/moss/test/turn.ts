// ONE TURN OF THE EVENT LOOP. Not a wait on a clock.
//
// A shell works in promise callbacks, and it sends what changed on a timer of
// zero (../src/shells/stream.ts: a pass at once, and one more on the next
// turn, for what a mount started). Everything that was ready to run has run
// once a turn is over, however fast or slow the machine is: the delay asked
// for is none, and what is waited for is the queue, in the order the loop
// keeps it. So a test that awaits a turn is not hoping enough time went by.
//
// Where a test awaits several, it is counting hops (a call, its answer, the
// pass that sends it), not milliseconds. Where the thing a test waits for can
// say so itself (a frame served, a build that has asked), the test waits on
// that instead: shells.test.ts, `servedTerminal` and `answeredByHand`.
//
// The same thing where a test must see what Node does at the END of a turn (a
// rejection nobody handled is reported then).
export const turn = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
