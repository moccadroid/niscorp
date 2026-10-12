import type { AdmittedClaim } from './admission';

export type Segment = { text: string; card: string; row: string };

type Placed = { start: number; end: number; claim: AdmittedClaim };

export const segmentsOf = (response: string, claims: readonly AdmittedClaim[]): Segment[] => {
  const placed: Placed[] = [];
  for (const claim of claims) {
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

export const streamingSegments = (soFar: string): Segment[] => (soFar === '' ? [] : [{ text: soFar, card: '', row: '' }]);
