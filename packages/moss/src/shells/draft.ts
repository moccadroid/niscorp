import type { DraftArtifact, SessionDraft } from '../manifest';
import type { Live } from './host-state';
import type { DraftSaving } from './types';

// Each step is the whole draft after it. `shown`: the step the shell shows, `0` for none of it.
export type DraftState = { steps: readonly (readonly DraftArtifact[])[]; shown: number };

export const noDraft = (): DraftState => ({ steps: [], shown: 0 });

export const draftedIn = (draft: DraftState): readonly DraftArtifact[] => draft.steps[draft.shown - 1] ?? [];

export const SHELL_GONE = 'moss: this session’s shell is gone, and its draft with it.';

export type DraftDeps = {
  saving: DraftSaving | undefined;
  liveOf: () => Live | undefined;
  // Has the shell take the draft as it is to be. The draft is that only once the shell has.
  adopt: (live: Live, next: DraftState) => Promise<void>;
};

export const sessionDraftOn = ({ saving, liveOf, adopt }: DraftDeps): SessionDraft => {
  const standing = (): Live => {
    const live = liveOf();
    if (live === undefined) throw new Error('moss: a function touched the draft before the session finished building.');
    if (live.ended) throw new Error(SHELL_GONE);
    return live;
  };
  const savingOrRefuse = (): DraftSaving => {
    if (saving === undefined) throw new Error('moss: this shell host was given nothing to keep a draft with.');
    return saving;
  };

  // In turn: each call starts from the draft as the one before it left it.
  let turn: Promise<unknown> = Promise.resolve();
  const inTurn = <Answer>(run: () => Promise<Answer>): Promise<Answer> => {
    const answer = turn.then(run, run);
    turn = answer.catch(() => undefined);
    return answer;
  };

  // A step taken while an earlier one is shown goes on from that one: the steps after it are dropped.
  const stepped = async (live: Live, drafted: readonly DraftArtifact[]): Promise<number> => {
    const steps = [...live.draft.steps.slice(0, live.draft.shown), drafted];
    await adopt(live, { steps, shown: steps.length });
    return steps.length;
  };

  return {
    add: (artifacts) =>
      inTurn(async () => {
        const live = standing();
        const answered = await savingOrRefuse().add(artifacts, draftedIn(live.draft));
        return { step: await stepped(live, answered.drafted), artifacts: answered.added };
      }),
    list: () => draftedIn(standing().draft),
    remove: (kind, id) =>
      inTurn(async () => {
        const live = standing();
        const drafted = draftedIn(live.draft);
        if (!drafted.some((one) => one.kind === kind && one.id === id)) throw new Error(`moss: no ${String(kind)} "${id}" is in the draft.`);
        return { step: await stepped(live, drafted.filter((one) => one.kind !== kind || one.id !== id)) };
      }),
    show: (step) =>
      inTurn(async () => {
        const live = standing();
        const last = live.draft.steps.length;
        if (!Number.isInteger(step) || step < 0 || step > last) throw new Error(`moss: the draft has no step ${String(step)}. Its steps: 0 to ${last}.`);
        await adopt(live, { steps: live.draft.steps, shown: step });
      }),
    discard: () => inTurn(async () => adopt(standing(), noDraft())),
    save: () =>
      inTurn(async () => {
        const live = standing();
        const saved = await savingOrRefuse().save(draftedIn(live.draft));
        live.draft = noDraft();
        return saved;
      }),
  };
};
