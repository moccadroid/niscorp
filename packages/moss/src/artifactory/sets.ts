export type SetOwners = {
  claim: (source: string, owner: string, handedOver: boolean) => void;
  ownerRefusalOf: (source: string) => string | undefined;
  assertAppOwned: (source: string) => string;
};

export const createSetOwners = (): SetOwners => {
  const owners = new Map<string, string>();
  const ownerRefusalOf = (source: string): string | undefined => {
    const owner = owners.get(source);
    return owner === undefined ? undefined : `the set "${source}" is ${owner}'s, and only its owner replaces it. An app hands a set over under a name of its own.`;
  };
  return {
    ownerRefusalOf,
    claim: (source, owner, handedOver) => {
      const held = owners.get(source);
      if (held !== undefined) throw new Error(`moss: the set "${source}" is ${held}'s, and ${owner} claims it too. A set has one writer.`);
      if (handedOver) throw new Error(`moss: the set "${source}" was handed over by the app, and ${owner} claims it. A set has one writer.`);
      owners.set(source, owner);
    },
    assertAppOwned: (source) => {
      const refusal = ownerRefusalOf(source);
      if (refusal !== undefined) throw new Error(`moss: ${refusal}`);
      return source;
    },
  };
};
