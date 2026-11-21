import { OperationFailure, RunControl } from '../engine/control.js';
import {
  createHtmlStructure,
  decodeHtmlSource,
  effectiveHtmlBase,
  resolveHtmlUrl,
  readHtmlProfile,
  HtmlSelectorError,
  HtmlFieldError,
  readHtmlFields,
} from '../readers/html/index.js';
import { readSourceBody, type HttpSource } from './source.js';
import defaults from './default-profile.json' with { type: 'json' };

export type FieldRule = { selector: string; attribute: string | null; closest?: string };
export type SelectedItem = {
  text: string;
  attributes: Record<string, string>;
  fields: Record<string, (string | null)[]>;
};
export type Selection = { baseUrl: string; encoding: string; items: SelectedItem[] };

const profile = readHtmlProfile();
const { maxInputBytes: _maxInputBytes, ...structureLimits } = profile.limits;

// Elements matching the record selector, each with every value its field rules read (all matches, in page order).
export const selectHtml = (
  source: HttpSource,
  selector: string,
  fields: Record<string, FieldRule>,
  signal: AbortSignal,
): Selection => {
  const decoded = decodeHtmlSource(readSourceBody(source), source.headers, profile);
  const structure = createHtmlStructure(decoded.html, structureLimits, signal);
  const base = effectiveHtmlBase(structure, source.url, source.headers, decoded.encoding, profile);
  try {
    const matches = structure.query(selector);
    if (matches.length > defaults.maxSelectedItems)
      throw new RunControl('HTML_ITEMS', 'Selected item limit exceeded');
    const rules = Object.fromEntries(
      Object.entries(fields).map(([name, rule]) => [name, { ...rule, minimum: 0, maximum: null }]),
    );
    const values = readHtmlFields(
      structure,
      matches,
      rules,
      { maxValues: profile.limits.maxFieldValues, maxBytes: profile.limits.maxFieldBytes },
      signal,
    );
    return {
      baseUrl: base.baseUrl,
      encoding: decoded.encoding,
      items: matches.map((element, index) => ({
        text: structure.textOf(element),
        attributes: { ...element.attribs },
        fields: values[index] ?? {},
      })),
    };
  } catch (error) {
    if (error instanceof HtmlSelectorError)
      throw new OperationFailure('HTML_SELECTOR', error.message);
    if (error instanceof HtmlFieldError)
      throw new OperationFailure('HTML_FIELD_MATCHES', error.message);
    throw error;
  }
};

// An absolute address for a link value, or null when it cannot be resolved.
export const resolveAddress = (value: string, base: string, encoding: string): string | null => {
  try {
    return resolveHtmlUrl(value, base, encoding).href;
  } catch {
    return null;
  }
};
