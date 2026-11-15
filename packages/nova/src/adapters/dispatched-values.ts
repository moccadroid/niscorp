export type DispatchedValues = {
  record: (value: unknown) => void;
  classify: (treeValue: unknown) => 'echo' | 'written';
};

export const createDispatchedValues = (): DispatchedValues => {
  let sent: unknown[] = [];
  const record = (value: unknown): void => {
    sent.push(value);
  };
  const classify = (treeValue: unknown): 'echo' | 'written' => {
    const at = sent.findIndex((value) => Object.is(value, treeValue));
    if (at === -1 || at === sent.length - 1) sent = [];
    return at === -1 ? 'written' : 'echo';
  };
  return { record, classify };
};
