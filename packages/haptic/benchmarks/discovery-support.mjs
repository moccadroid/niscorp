import profile from '../src/discovery/default-profile.json' with { type: 'json' };
import { isDeepStrictEqual } from 'node:util';
import { RunControl } from '../dist/index.js';
import { evaluate } from '@niscorp/prism';

const gradeMappedOutput = (task, value, sample) => {
  if (!Object.hasOwn(task, 'expectedMapping'))
    throw new Error('Shaped benchmark needs an independent expectedMapping');
  if (
    !Array.isArray(task.expectedMetadata?.visited) ||
    typeof task.expectedMetadata?.limited !== 'boolean'
  )
    throw new Error('Shaped benchmark needs independent expectedMetadata');
  const expected = evaluate(
    task.expectedMapping,
    {
      input: sample,
    },
    { limits: profile.trial.prism },
  );
  const metadataExact =
    isDeepStrictEqual(value.visited, task.expectedMetadata.visited) &&
    value.limited === task.expectedMetadata.limited;
  return {
    scope: 'final-data-and-acquisition-metadata',
    exact: metadataExact && Object.hasOwn(value, 'data') && isDeepStrictEqual(value.data, expected),
    metadataExact,
    actual: value.data,
    expected,
  };
};

export const runReplay = async (prepared, input) => {
  try {
    return await prepared.run(input);
  } catch (error) {
    if (!(error instanceof RunControl)) throw error;
    return { status: 'failed', value: null, error: { code: error.code, message: error.message } };
  }
};

export const readRecordedModelOutput = (body) =>
  JSON.parse(
    body
      .split('\n')
      .filter((line) => line.startsWith('data: {'))
      .flatMap((line) => JSON.parse(line.slice(6)).choices ?? [])
      .filter((choice) => choice.index === 0)
      .map((choice) => choice.delta?.content ?? '')
      .join(''),
  );

export const authorUsageCoverage = (rows) => {
  const requests = rows
    .flatMap((row) => row.calls ?? [])
    .filter((call) => call.provider === '120b' && call.dispatched !== false);
  const usage = rows.flatMap((row) => row.sdkUsage ?? []);
  const providerReported = requests.filter(
    (call) =>
      Number.isFinite(call.usage?.prompt_tokens) && Number.isFinite(call.usage?.completion_tokens),
  ).length;
  const sdkReported = usage.filter((entry) => entry.reported === true).length;
  return {
    providerRequests: requests.length,
    providerRequestsWithUsage: providerReported,
    sdkUsageObservations: usage.length,
    sdkReportedObservations: sdkReported,
    fullyReported:
      requests.length > 0 &&
      providerReported === requests.length &&
      usage.length > 0 &&
      sdkReported === usage.length,
  };
};

export const assertResultContract = (task) => {
  if (task.referenceUnavailable) throw new Error(task.referenceUnavailable);
  if (task.referenceTraversal || (task.resourceReference && task.checkSelection === false)) return;
  if (!Object.hasOwn(task, 'expectedMapping'))
    throw new Error(
      'Benchmark needs an independent expectedMapping for final result data: ' + task.id,
    );
  if (
    !Array.isArray(task.expectedMetadata?.visited) ||
    typeof task.expectedMetadata?.limited !== 'boolean'
  )
    throw new Error('Benchmark needs independent expectedMetadata: ' + task.id);
};

// Expected URLs come from the independent listing selector and recorded HTTP responses,
// never from the discovered artifact's page list. No network or model calls occur here.
export const gradeDiscoveryResult = async (task, value, sources, operations) => {
  assertResultContract(task);
  const context = { signal: AbortSignal.timeout(profile.trial.maxActiveMs) };
  const byUrl = new Map(sources.map((source) => [source.url, source]));
  const finalSource = (
    url,
    maxRedirects = profile.traversal.maxRedirects,
    allowMissing = false,
  ) => {
    for (let redirects = 0; redirects <= maxRedirects; redirects++) {
      const source = byUrl.get(url);
      if (!source) {
        if (allowMissing) return null;
        throw new Error('Missing reference HTTP response: ' + url);
      }
      if (source.status === 200) return source;
      const location = source.headers.location?.[0];
      if (![301, 302, 303, 307, 308].includes(source.status) || !location)
        throw new Error('Unusable reference HTTP response: ' + url + ' status ' + source.status);
      url = new URL(location, source.url).href;
    }
    throw new Error('Reference redirect limit exceeded: ' + url);
  };
  const root = finalSource(task.url);
  if (task.referenceTraversal) {
    const config = task.referenceTraversal;
    const sample =
      config.format === 'xml'
        ? await operations['xml.select'].run({ source: root, rule: config.rule }, context)
        : await operations['json.read'].run({ source: root }, context);
    const references = evaluate(config.mapping, { input: sample }, { limits: profile.trial.prism });
    if (!Array.isArray(references) || references.some((reference) => typeof reference !== 'string'))
      throw new Error('Independent navigation reference must produce URL strings');
    const urls = [
      ...new Set(references.map((reference) => new URL(reference, root.url).href.split('#')[0])),
    ].filter((url) => url !== task.url && url !== root.url);
    const pages = urls.slice(0, (task.maxPages ?? profile.traversal.maxPages) - 1);
    const expectedVisited = [task.url, ...pages];
    const metadataExact =
      isDeepStrictEqual(value.visited, expectedVisited) &&
      value.limited === urls.length > pages.length;
    if (!metadataExact)
      return { exact: false, metadataExact, actual: value.visited, expected: expectedVisited };
    const resourceUrls = [];
    for (const url of pages) {
      const source = finalSource(url, undefined, true);
      if (!source) return { exact: false, metadataExact, missingResponse: url };
      const selection = await operations['html.select'].run(
        { source, selector: task.expectedDestinationSelector },
        context,
      );
      if (!selection.items.length)
        throw new Error('Independent destination has no resource references: ' + url);
      for (const item of selection.items) {
        const reference = task.resourceReference.reduce((value, part) => value?.[part], item);
        if (typeof reference !== 'string') throw new Error('Missing independent resource URL');
        const resolved = await operations['url.resolve'].run(
          { value: reference, base: selection.baseUrl, encoding: selection.encoding },
          context,
        );
        if (!resourceUrls.includes(resolved)) resourceUrls.push(resolved);
      }
    }
    const admitted = resourceUrls.slice(0, task.maxResources ?? profile.resources.maxResources);
    const expectedByUrl = new Map();
    for (const url of admitted) {
      const source = finalSource(url, undefined, true);
      if (!source) return { exact: false, metadataExact, missingResponse: url };
      expectedByUrl.set(source.url, source);
    }
    const expected = [...expectedByUrl.values()];
    const actual = value.resources?.items?.map((item) => item.source) ?? [];
    const files = expected.map((source, index) => ({
      url: source.url,
      bytes: actual[index]?.body?.bytes ?? null,
      exact:
        actual[index]?.url === source.url &&
        actual[index]?.status === 200 &&
        actual[index]?.body?.base64 === source.body.base64 &&
        actual[index]?.body?.sha256 === source.body.sha256 &&
        Buffer.from(source.body.base64, 'base64').subarray(0, 5).toString() === '%PDF-',
    }));
    return {
      scope: 'downloaded-resources-and-acquisition-metadata',
      exact:
        metadataExact &&
        actual.length === expected.length &&
        files.every((file) => file.exact) &&
        value.resources?.limited === resourceUrls.length > admitted.length,
      metadataExact,
      actual: actual.length,
      expected: expected.length,
      files,
    };
  }
  if (task.expectedFormat === 'xml') {
    const sample = await operations['xml.select'].run(
      { source: root, rule: task.expectedRule },
      context,
    );
    return gradeMappedOutput(task, value, sample);
  }
  if (task.expectedFormat === 'json') {
    const sample = await operations['json.read'].run({ source: root }, context);
    return gradeMappedOutput(task, value, sample);
  }
  const selected = await operations['html.select'].run(
    { source: root, selector: task.expectedSelector, fields: task.expectedFields ?? null },
    context,
  );
  if (!task.expectedDestinationSelector) {
    const selection = Object.hasOwn(task, 'expectedMapping')
      ? gradeMappedOutput(task, value, {
          pages: [{ url: root.url, ...selected }],
          ...task.expectedMetadata,
        })
      : null;
    if (!task.resourceReference)
      return {
        ...selection,
        exact: selection.exact && value.resources === undefined,
        unexpectedResources: value.resources !== undefined,
      };
    const urls = [];
    for (const item of selected.items) {
      const reference = task.resourceReference.reduce((value, part) => value?.[part], item);
      if (typeof reference !== 'string') throw new Error('Missing independent resource reference');
      const url = await operations['url.resolve'].run(
        { value: reference, base: selected.baseUrl, encoding: selected.encoding },
        context,
      );
      const normalized = profile.resources.stripFragments ? url.split('#')[0] : url;
      if (!urls.includes(normalized)) urls.push(normalized);
    }
    const admitted = urls.slice(0, task.maxResources ?? profile.resources.maxResources);
    const expected = [];
    for (const url of admitted) {
      const source = finalSource(url, profile.resources.maxRedirects);
      if (!expected.some((item) => item.url === source.url)) expected.push(source);
    }
    const actual = value.resources?.items?.map((item) => item.source) ?? [];
    const prefix = task.resourcePrefixBase64
      ? Buffer.from(task.resourcePrefixBase64, 'base64')
      : null;
    const files = expected.map((source, index) => ({
      url: source.url,
      exact:
        actual[index]?.url === source.url &&
        actual[index]?.status === source.status &&
        actual[index]?.body?.base64 === source.body.base64 &&
        actual[index]?.body?.sha256 === source.body.sha256 &&
        actual[index]?.body?.bytes === source.body.bytes &&
        (prefix === null ||
          Buffer.from(actual[index].body.base64, 'base64')
            .subarray(0, prefix.length)
            .equals(prefix)),
      bytes: actual[index]?.body?.bytes ?? null,
    }));
    const resources = {
      exact:
        actual.length === expected.length &&
        files.every((file) => file.exact) &&
        value.resources?.limited === urls.length > admitted.length,
      actual: actual.length,
      expected: expected.length,
      files,
    };
    return {
      ...selection,
      scope:
        task.checkSelection === false
          ? 'downloaded-resources-only'
          : 'final-data-and-downloaded-resources',
      exact: (task.checkSelection === false || selection.exact) && resources.exact,
      resources,
    };
  }
  const urls = [];
  for (const item of selected.items) {
    const url = (
      await operations['url.resolve'].run(
        { value: item.attributes.href, base: selected.baseUrl, encoding: selected.encoding },
        context,
      )
    ).split('#')[0];
    if (!urls.includes(url)) urls.push(url);
    if (urls.length === (task.maxPages ?? profile.traversal.maxPages) - 1) break;
  }
  const referencePages = [];
  for (const url of urls) {
    if (!byUrl.has(url)) {
      continue;
    }
    const source = finalSource(url);
    const reference = await operations['html.select'].run(
      { source, selector: task.expectedDestinationSelector },
      context,
    );
    referencePages.push({ url: source.url, ...reference });
  }
  const mapped = gradeMappedOutput(task, value, {
    pages: referencePages,
    ...task.expectedMetadata,
  });
  return {
    ...mapped,
    exact: mapped.exact && referencePages.length === urls.length && value.resources === undefined,
    unexpectedResources: value.resources !== undefined,
  };
};

export const runConcurrent = async (items, concurrency, run) => {
  const results = new Array(items.length);
  let next = 0,
    failure = null;
  const worker = async () => {
    while (!failure && next < items.length) {
      const index = next++;
      try {
        results[index] = await run(items[index], index);
      } catch (error) {
        failure ??= { error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  if (failure) throw failure.error;
  return results;
};
