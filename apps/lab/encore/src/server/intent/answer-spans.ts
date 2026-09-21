import type { AdmittedClaim } from './admission';

// AN ANSWER, CUT INTO SPANS. The agent returns words and, beside them, claims:
// "these words stand on that card". The card renders segments — so the cut is
// made here, once, from claims that were already admitted: a segment either
// carries a card (a citation: linked, lightable) or it does not (and, once the
// answer has landed, is drawn as unsupported).
//
// Claims are located by their own text, in order, never twice over the same
// characters: two claims that overlap cannot both be underlined, and the earlier
// one wins. A claim that cannot be placed after the ones before it is simply not
// a segment — admission already said whether its text was in the answer.

export type Segment = { text: string; card: string; row: string };

type Placed = { start: number; end: number; claim: AdmittedClaim };

export const segmentsOf = (response: string, claims: readonly AdmittedClaim[]): Segment[] => {
  const placed: Placed[] = [];
  for (const claim of claims) {
    // The first occurrence that does not collide with a claim already placed.
    let from = 0;
    while (from <= response.length) {
      const start = response.indexOf(claim.text, from);
      if (start < 0) break;
      const end = start + claim.text.length;
      if (!placed.some((other) => start < other.end && end > other.start)) {
        placed.push({ start, end, claim });
        break;
      }
      from = start + 1;
    }
  }
  placed.sort((a, b) => a.start - b.start);

  const segments: Segment[] = [];
  let at = 0;
  for (const span of placed) {
    if (span.start > at) segments.push({ text: response.slice(at, span.start), card: '', row: '' });
    segments.push({ text: response.slice(span.start, span.end), card: span.claim.card, row: span.claim.row });
    at = span.end;
  }
  if (at < response.length) segments.push({ text: response.slice(at), card: '', row: '' });
  return segments;
};

// While it streams there is nothing to cite yet: one plain span.
export const streamingSegments = (soFar: string): Segment[] => (soFar === '' ? [] : [{ text: soFar, card: '', row: '' }]);
