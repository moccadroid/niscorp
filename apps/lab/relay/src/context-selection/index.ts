import type { createSignal } from '@niscorp/signal';

// A piece of context: what the decider reads to judge it (`about`), what the model reads when it is taken
// (`content`), and the pieces it brings along (`with`), such as the other side of a join.
export type Piece = { id: string; about: string; content: string; with?: readonly string[] };

export type Decider = Pick<ReturnType<typeof createSignal>, 'decide'>;

export type Selection = {
  content: string;
  taken: string[];
  left: { id: string; about: string }[];
  // Each piece's probability of being needed, when the decider is calibrated.
  probabilities: Record<string, number>;
  ms: number;
  failed?: string;
};

const everything = (pieces: readonly Piece[], ms: number, failed?: string): Selection => ({
  content: pieces.map((piece) => piece.content).join('\n'),
  taken: pieces.map((piece) => piece.id),
  left: [],
  probabilities: {},
  ms,
  ...(failed === undefined ? {} : { failed }),
});

// One decision call for a request: a yes/no question per piece, a piece taken at a probability of 0.5 or more, then
// the pieces those bring along. The descriptions travel in the state and each question only names its piece: written
// into the question, a description is read poorly. When the decider fails, or takes nothing, everything is taken.
export const selectContext = async (options: { decider: Decider; request: unknown; pieces: readonly Piece[]; noun?: string }): Promise<Selection> => {
  const { pieces } = options;
  const noun = options.noun ?? 'piece';
  const t0 = Date.now();
  if (pieces.length === 0) return everything(pieces, 0);
  const keyOf = (at: number): string => `p${at}`;
  try {
    const result = await options.decider.decide({
      state: { request: options.request, [`${noun}s`]: Object.fromEntries(pieces.map((piece, at) => [keyOf(at), `${piece.id}: ${piece.about}`])) },
      questions: Object.fromEntries(
        pieces.map((_, at) => [keyOf(at), { type: 'noul' as const, instructions: `Is ${noun} ${keyOf(at)} needed to answer the request: read, filtered on, joined through or counted?` }]),
      ),
    });
    const decisions = result.decisions as Record<string, { answer: boolean; noul?: number }>;
    const probabilities = Object.fromEntries(pieces.flatMap((piece, at) => (typeof decisions[keyOf(at)]?.noul === 'number' ? [[piece.id, decisions[keyOf(at)]?.noul as number]] : [])));
    const picked = new Set(pieces.filter((_, at) => decisions[keyOf(at)]?.answer === true).map((piece) => piece.id));
    if (picked.size === 0) return { ...everything(pieces, Date.now() - t0), probabilities };
    for (const piece of pieces) if (picked.has(piece.id)) for (const other of piece.with ?? []) picked.add(other);
    const taken = pieces.filter((piece) => picked.has(piece.id));
    return {
      content: taken.map((piece) => piece.content).join('\n'),
      taken: taken.map((piece) => piece.id),
      left: pieces.filter((piece) => !picked.has(piece.id)).map((piece) => ({ id: piece.id, about: piece.about })),
      probabilities,
      ms: Date.now() - t0,
    };
  } catch (error) {
    return everything(pieces, Date.now() - t0, error instanceof Error ? error.message : String(error));
  }
};
