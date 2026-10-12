// The share of the anchor an edited line must still begin with. The anchor is the furthest the
// sentence was typed, so a backspace and a different ending are not two continuations in a row.
export const CONTINUATION_KEEPS = 0.7;

const normalise = (text: string): string => text.trim().toLowerCase().replace(/\s+/g, ' ');

const commonPrefixLength = (a: string, b: string): number => {
  const limit = Math.min(a.length, b.length);
  let index = 0;
  while (index < limit && a[index] === b[index]) index += 1;
  return index;
};

export const continues = (anchor: string, line: string): boolean => {
  const from = normalise(anchor);
  const to = normalise(line);
  if (from === '') return true;
  if (to.startsWith(from) || from.startsWith(to)) return true;
  return commonPrefixLength(from, to) >= CONTINUATION_KEEPS * from.length;
};

export const anchorAfter = (anchor: string, line: string): string => {
  const from = normalise(anchor);
  const to = normalise(line);
  return continues(anchor, line) && from.startsWith(to) ? from : to;
};
