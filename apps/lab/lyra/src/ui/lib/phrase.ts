// The SOURCE-LANGUAGE half of the pattern op.
//
// A counted phrase leaves a vex mapping as `{ phrase: '{n} of {total}',
// slots: { n: 1, total: 12 } }` — structured, so the render pass can
// translate the pattern WHOLE and fill it in the reader's language (the book
// lives there, and only there). A session in the source language skips that
// pass entirely — an empty book skips the walk, deliberately — so the raw
// shape reaches the glass and the kit fills it here instead. Same holes,
// same rule, no book.
export const fillPhrase = (value: unknown): unknown => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  const { phrase, slots } = value as { phrase?: unknown; slots?: unknown };
  if (typeof phrase !== 'string' || slots === null || typeof slots !== 'object' || Array.isArray(slots)) return value;
  const held = slots as Record<string, unknown>;
  return phrase.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (hole, name: string) => {
    const slot = held[name];
    return slot === undefined || slot === null ? hole : String(slot);
  });
};
