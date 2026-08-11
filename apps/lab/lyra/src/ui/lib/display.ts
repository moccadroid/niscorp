// Turning whatever a binding resolved to into something safe to render.
//
// This exists because of a real crash, and the crash is worth writing down.
// `errorTarget` writes nova's endpoint error — `{ status, message, data }` —
// into the action's data. Every layout in this application then bound it as
// `message: '$.error'`, which put an OBJECT where React expected a node. React
// does not degrade there: it throws, the tree unmounts, and the whole page
// goes white. So a member who typed an address we already had did not see
// "already a member here" — they saw nothing at all, and neither did anybody
// else until they reloaded.
//
// The rule this enforces: A DATA SHAPE MUST NEVER BLANK THE APPLICATION.
// A component handed something it did not expect shows less, never nothing.
// Headless checks cannot catch this class — they assert on the render tree,
// which is built fine; the failure is in React turning that tree into DOM.
// So it is fixed in the one place every message passes through instead of
// being left to eleven call sites to remember.
export const displayText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  // The endpoint-error case, and the reason this function exists. Anything
  // carrying a human-readable `message` is asking to be shown as that.
  if (typeof value === 'object' && 'message' in value) {
    const message = (value as { message: unknown }).message;
    if (typeof message === 'string' && message !== '') return message;
  }

  // A shape nobody anticipated. JSON is not a good message, but it is a
  // legible one, and it beats a blank screen by the entire width of the bug
  // this function was written for.
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
};
