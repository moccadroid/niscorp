import assert from 'node:assert/strict';

const normalize = (value) => String(value).replace(/\s+/g, ' ').trim();
const leaves = (value) =>
  value === null || value === undefined
    ? []
    : typeof value === 'object'
      ? Object.values(value).flatMap(leaves)
      : [value];

const matches = (actual, wanted, baseUrl) => {
  if (wanted.kind === 'headline') {
    const text = (value) => normalize(value).replace(/[\p{P}\p{Z}\s]/gu, '');
    return [wanted.value, ...(wanted.aliases ?? [])].some((value) => text(actual) === text(value));
  }
  if (wanted.aliases?.some((alias) => normalize(actual) === normalize(alias))) return true;
  if (wanted.kind === 'url') {
    if (typeof actual !== 'string' || !/^(https?:\/\/|\/|\.{1,2}\/)/.test(actual)) return false;
    try {
      return new URL(actual, baseUrl).href === wanted.value;
    } catch {
      return false;
    }
  }
  if (wanted.kind === 'number') {
    if (typeof actual === 'number') return actual === wanted.value;
    const text = normalize(actual).replace(/[\p{Sc}\s]/gu, '');
    return /^\d+(?:[.,]\d+)?$/.test(text) && Number(text.replace(',', '.')) === wanted.value;
  }
  if (wanted.kind === 'contains') return normalize(actual).includes(normalize(wanted.value));
  return normalize(actual) === normalize(wanted.value);
};

// Evaluator-only roles come from request/key meanings, never matching answer values.
// Only explicitly declared roles may inherit named context; no parent value bags.
const containsRecord = (value) =>
  Array.isArray(value) ? value.some(containsRecord) : Boolean(value && typeof value === 'object');
const recordCandidates = (data, roles, inherited = {}, metadataKeys = []) => {
  if (Array.isArray(data))
    return data.flatMap((value) => recordCandidates(value, roles, inherited, metadataKeys));
  if (!data || typeof data !== 'object') return [];
  const children = Object.entries(data).filter(
    ([key, value]) => !metadataKeys.includes(key) && containsRecord(value),
  );
  const local = Object.entries(data).filter(([key]) => !children.some(([child]) => child === key));
  const fields = Object.fromEntries(
    Object.entries(roles).map(([role, definition]) => [
      role,
      local.filter(([key]) => definition.keys.includes(key)).flatMap(([, value]) => leaves(value)),
    ]),
  );
  const own = Object.fromEntries(
    Object.entries(fields).map(([role, values]) => [
      role,
      values.length ? values : (inherited[role] ?? []),
    ]),
  );
  // A semantic record cannot silently become a wrapper for another record.
  // Explicit inherited grouping roles and declared metadata remain unambiguous.
  if (
    children.length &&
    Object.entries(roles).some(
      ([, definition]) =>
        !definition.inherit && local.some(([key]) => definition.keys.includes(key)),
    )
  )
    return [
      {
        values: [],
        fields: own,
        bound: [],
        ambiguous: [],
        unknownKeys: ['ambiguous-parent-record'],
        original: data,
      },
    ];
  if (!children.length)
    return [
      {
        values: local.flatMap(([, value]) => leaves(value)),
        fields: own,
        bound: Object.keys(roles).filter(
          (role) =>
            roles[role].keys.some((key) => Object.hasOwn(data, key)) || inherited[role]?.length,
        ),
        ambiguous: Object.keys(roles).filter(
          (role) => roles[role].keys.filter((key) => Object.hasOwn(data, key)).length > 1,
        ),
        unknownKeys: local
          .map(([key]) => key)
          .filter(
            (key) =>
              !Object.values(roles).some((role) => role.keys.includes(key)) &&
              !metadataKeys.includes(key),
          ),
        original: data,
      },
    ];
  return children.flatMap(([key, value]) =>
    recordCandidates(
      value,
      roles,
      Object.fromEntries(
        Object.entries(roles).map(([role, definition]) => [
          role,
          definition.contextLabels?.includes(key)
            ? [key]
            : definition.inherit
              ? own[role]
              : (inherited[role] ?? []),
        ]),
      ),
      metadataKeys,
    ),
  );
};

const valueCandidates = (data, contract) => {
  const values = [],
    unknown = [];
  const walk = (value, path = []) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, [...path, index]));
      return;
    }
    if (!value || typeof value !== 'object') {
      if (value != null) values.push(value);
      return;
    }
    const entries = Object.entries(value);
    if (contract.valueFields) {
      const fields = entries.filter(([key]) => contract.valueFields.includes(key));
      if (fields.length) {
        fields.forEach(([, item]) => values.push(...leaves(item)));
        entries
          .filter(
            ([key]) =>
              !contract.valueFields.includes(key) && !(contract.metadataKeys ?? []).includes(key),
          )
          .forEach(([key]) => unknown.push([...path, key]));
        return;
      }
    }
    if (contract.valueKeys && entries.every(([key]) => contract.valueKeys.includes(key))) {
      entries.forEach(([, item]) => values.push(...leaves(item)));
      return;
    }
    if (entries.every(([, item]) => item && typeof item === 'object'))
      entries.forEach(([key, item]) => walk(item, [...path, key]));
    else unknown.push(path);
  };
  walk(data);
  return { candidates: values.map((value) => ({ values: [value], original: value })), unknown };
};

export const assertQualificationContract = (contract) => {
  assert(contract && ['values', 'records'].includes(contract.kind));
  assert(Array.isArray(contract.expected));
  assert.equal(new Set(contract.expected.map((row) => row.id)).size, contract.expected.length);
  assert(Array.isArray(contract.sourceHashes) && contract.sourceHashes.length > 0);
  for (const definition of Object.values(contract.roles ?? {})) {
    assert(
      Array.isArray(definition.keys) && definition.keys.every((key) => typeof key === 'string'),
    );
    assert(definition.contextLabels === undefined || Array.isArray(definition.contextLabels));
  }
  assert(contract.uniqueResults === undefined || typeof contract.uniqueResults === 'boolean');
  assert(
    contract.maximumCount === undefined ||
      (Number.isInteger(contract.maximumCount) && contract.maximumCount >= 0),
  );
  for (const row of contract.expected) {
    assert(typeof row.id === 'string' && row.id);
    assert(Array.isArray(row.identity) && row.identity.length > 0);
    for (const fact of [...row.identity, ...(row.details ?? [])]) {
      assert(['exact', 'contains', 'url', 'number', 'headline'].includes(fact.kind));
      assert(['string', 'number'].includes(typeof fact.value));
      assert(normalize(fact.value));
    }
  }
};

/** Independent frozen facts, never a generated selector/schema/reviewer as the oracle. */
export const qualifyResult = ({ contract, artifact, execution, review, blocked }) => {
  if (!artifact && blocked) {
    return {
      classification: null,
      scorable: false,
      operational: 'blocked',
      blocked,
      reason: 'Infrastructure blocked this attempt; extraction quality was not evaluated.',
      falseAcceptance: false,
    };
  }
  assertQualificationContract(contract);
  if (!artifact || execution?.status !== 'completed' || !Object.hasOwn(execution.value, 'data')) {
    return {
      classification: 'unresolved',
      reason: !artifact ? 'No published artifact' : 'Artifact execution did not return data',
      expectedCount: contract.expected.length,
      matchedCount: 0,
      falseAcceptance: false,
    };
  }
  const data = execution.value.data;
  const unscorable = (reason, paths = []) => ({
    classification: null,
    scorable: false,
    reason,
    paths,
    falseAcceptance: false,
  });
  if (
    contract.kind === 'records' &&
    contract.expected.some((row) =>
      [...row.identity, ...(row.details ?? [])].some(
        (fact) => !fact.role || !contract.roles?.[fact.role],
      ),
    )
  )
    return unscorable(
      'Record facts need explicit evaluator roles derived from the request and key meanings',
    );
  const valueView = contract.kind === 'values' ? valueCandidates(data, contract) : null;
  if (valueView?.unknown.length)
    return unscorable('Object result fields have no explicit evaluator binding', valueView.unknown);
  const candidates =
    contract.kind === 'values'
      ? valueView.candidates
      : recordCandidates(data, contract.roles ?? {}, {}, contract.metadataKeys ?? []);
  if (contract.kind === 'records') {
    if (
      candidates.some(
        (candidate) =>
          !candidate.bound.length || candidate.ambiguous.length || candidate.unknownKeys.length,
      )
    )
      return unscorable(
        'Unrecognised or ambiguous record key roles; inspect key meanings rather than searching unrelated fields',
      );
  }
  const candidateMatches = (candidate, wanted) => {
    const values = wanted.role ? (candidate.fields[wanted.role] ?? []) : candidate.values;
    return (
      values.some((value) => matches(value, wanted, contract.baseUrl)) ||
      (wanted.kind === 'contains' && matches(values.join(' '), wanted, contract.baseUrl))
    );
  };
  const edges = contract.expected.map((record) =>
    candidates
      .map((candidate, index) => ({
        index,
        missing: (record.details ?? []).filter((wanted) => !candidateMatches(candidate, wanted)),
      }))
      .filter(({ index }) =>
        record.identity.every((wanted) => candidateMatches(candidates[index], wanted)),
      )
      .sort((a, b) => a.missing.length - b.missing.length || a.index - b.index),
  );
  const owners = new Map();
  const assign = (expectedIndex, visited) => {
    for (const edge of edges[expectedIndex]) {
      if (visited.has(edge.index)) continue;
      visited.add(edge.index);
      const previous = owners.get(edge.index);
      if (previous === undefined || assign(previous, visited)) {
        owners.set(edge.index, expectedIndex);
        return true;
      }
    }
    return false;
  };
  contract.expected.forEach((_, index) => assign(index, new Set()));
  const checked = contract.expected.map((record, expectedIndex) => {
    const actualIndex = [...owners].find(([, owner]) => owner === expectedIndex)?.[0];
    const edge = edges[expectedIndex].find((candidate) => candidate.index === actualIndex);
    return {
      id: record.id,
      found: actualIndex !== undefined,
      actualIndex: actualIndex ?? null,
      missingDetails: edge?.missing ?? record.details ?? [],
    };
  });
  const expectedUrls = contract.expected
    .flatMap((row) => [...row.identity, ...(row.details ?? [])])
    .filter((fact) => fact.kind === 'url')
    .map((fact) => fact.value);
  const unexpectedUrls =
    contract.kind === 'values' && expectedUrls.length
      ? [
          ...new Set(
            candidates
              .flatMap((row) => row.values)
              .filter((value) => typeof value === 'string' && /^https?:\/\//.test(value)),
          ),
        ].filter(
          (value) => !expectedUrls.includes(value) && !(contract.ignoreUrls ?? []).includes(value),
        )
      : [];
  const unmatchedRecords =
    contract.kind === 'records'
      ? candidates.filter((_, index) => !owners.has(index)).map((row) => row.original)
      : [];
  const ordered =
    !contract.ordered ||
    checked
      .filter((row) => row.found)
      .every((row, index, rows) => index === 0 || rows[index - 1].actualIndex < row.actualIndex);
  const matchedCount = checked.filter((row) => row.found).length;
  const target = Math.min(
    contract.targetCount ?? contract.expected.length,
    contract.expected.length,
  );
  const supportedRows = checked.filter((row) => row.found);
  const unsupportedValues = contract.checkAllValues
    ? supportedRows.flatMap((row) => {
        const expected = contract.expected.find((record) => record.id === row.id);
        const candidate = candidates[row.actualIndex];
        return Object.entries(candidate.fields).flatMap(([role, values]) =>
          values
            .filter(
              (value) =>
                ![...expected.identity, ...(expected.details ?? [])].some(
                  (wanted) => wanted.role === role && matches(value, wanted, contract.baseUrl),
                ),
            )
            .map((value) => ({ id: row.id, role, value })),
        );
      })
    : [];
  const unmatchedValues =
    contract.kind === 'values'
      ? candidates
          .filter(
            (candidate) =>
              !contract.expected.some((row) =>
                row.identity.every((wanted) => candidateMatches(candidate, wanted)),
              ),
          )
          .map((row) => row.original)
      : [];
  const canonical = (value) => {
    try {
      return new URL(value, contract.baseUrl).href;
    } catch {
      return normalize(value);
    }
  };
  const duplicateValues =
    contract.kind === 'values'
      ? candidates
          .filter(
            (row, index) =>
              candidates.findIndex(
                (other) => canonical(other.original) === canonical(row.original),
              ) < index,
          )
          .map((row) => row.original)
      : [];
  const cardinalityViolated =
    (contract.uniqueResults === true && duplicateValues.length > 0) ||
    (contract.maximumCount !== undefined && candidates.length > contract.maximumCount);
  const complete =
    matchedCount >= target &&
    (contract.targetCount === undefined || candidates.length <= contract.targetCount) &&
    supportedRows.every((row) => !row.missingDetails.length) &&
    !unexpectedUrls.length &&
    !unmatchedRecords.length &&
    !unsupportedValues.length &&
    !unmatchedValues.length &&
    !cardinalityViolated &&
    ordered &&
    (contract.expected.length > 0 || leaves(data).length === 0);
  const classification = complete ? 'complete' : matchedCount ? 'useful-partial' : 'unusable';
  const accepted = review?.decision?.accepted === true;
  return {
    classification,
    scorable: true,
    expectedCount: target,
    eligibleCount: contract.expected.length,
    matchedCount,
    checked,
    unexpectedUrls,
    unmatchedRecords,
    unsupportedValues,
    unmatchedValues,
    duplicateValues,
    cardinalityViolated,
    ordered,
    reviewAcceptedNoncomplete: accepted && !complete,
    falseAcceptance:
      accepted &&
      (classification === 'unusable' ||
        unexpectedUrls.length > 0 ||
        unmatchedRecords.length > 0 ||
        unsupportedValues.length > 0 ||
        unmatchedValues.length > 0 ||
        cardinalityViolated),
    reviewReasonAuditRequired:
      accepted &&
      !complete &&
      !unexpectedUrls.length &&
      !unmatchedRecords.length &&
      !unsupportedValues.length &&
      !unmatchedValues.length &&
      !cardinalityViolated &&
      matchedCount > 0,
  };
};
