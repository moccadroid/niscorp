// Text compared the way people read it: Unicode compatibility forms, any dash as "-", curly quotes as straight ones,
// runs of whitespace as one space, lower case. Models write U+2011 for "-" and curly quotes for straight ones.
export const fold = (value: unknown): string =>
  String(value ?? '')
    .normalize('NFKC')
    .replace(/[‐-―−]/g, '-')
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
