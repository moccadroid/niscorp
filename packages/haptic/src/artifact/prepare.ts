import { DOMImplementation } from '@xmldom/xmldom';
import { Ajv2020 } from 'ajv/dist/2020.js';
import formats from 'ajv-formats';
import { useNamespaces } from 'xpath';
import { validate as checkProgram, type Config } from '@niscorp/prism';
import { validateLocator } from '../readers/html/locator.js';
import { upgradeArtifact } from './grammar.js';
import {
  ArtifactSchema,
  JsonRecordStageSchema,
  JsonReferenceStageSchema,
  LinkStageSchema,
  RecordStageSchema,
  XmlRecordStageSchema,
  XmlReferenceStageSchema,
  type Artifact,
  type FieldRule,
} from './schema.js';
import { templateNames } from './request.js';
import { walk, type Report, type RunInput, type WalkOptions, type WalkResult } from './walk.js';

export class ArtifactError extends Error {
  constructor(
    readonly code: 'UPGRADE' | 'GRAMMAR' | 'SELECTOR' | 'PROGRAM' | 'OUTPUT_SCHEMA',
    message: string,
  ) {
    super(message);
  }
}

export type Inspection = Report & {
  // The run's result; null when the run stopped.
  result: WalkResult | null;
  // Why the run stopped; code is the WalkError, FormatError or OperationFailure code when there is one.
  error: { code: string | null; message: string } | null;
};

export type PreparedArtifact = {
  artifact: Artifact;
  program: Config;
  // Each stage's checked reference program, by stage position; null for stages without one.
  references: (Config | null)[];
  // The request's checked `more` program; null without one.
  more: Config | null;
  // null when the data fits the output schema; otherwise what is wrong.
  checkOutput(data: unknown): string | null;
  // One run with no model: current data from the page at this address, or from the artifact's request filled with
  // these inputs.
  run(input: RunInput, options: WalkOptions): Promise<WalkResult>;
  // The same run, for whoever writes the artifact: what each page gave at each stage, the records the program saw, and
  // why the run stopped instead of an exception.
  inspect(input: RunInput, options: WalkOptions): Promise<Inspection>;
};

const describe = (issues: { path: readonly PropertyKey[]; message: string }[]) =>
  issues.map((issue) => `${issue.path.map(String).join('.') || '$'}: ${issue.message}`).join('; ');

const STAGES = [
  RecordStageSchema,
  LinkStageSchema,
  XmlRecordStageSchema,
  JsonRecordStageSchema,
  XmlReferenceStageSchema,
  JsonReferenceStageSchema,
];
const KINDS = 'records (html, xml, json), links (html), references (xml, json)';

// Zod says only "Invalid input" for a stage that fits no stage kind; the kind with the stage's kind and format says
// what is wrong with it.
const grammarIssues = (
  value: unknown,
  issues: { path: PropertyKey[]; message: string; code: string }[],
) =>
  issues.flatMap((issue) => {
    const [top, index] = issue.path;
    if (issue.code !== 'invalid_union' || top !== 'stages' || typeof index !== 'number')
      return [issue];
    const stage = (value as { stages: Record<string, unknown>[] }).stages[index] ?? {};
    const schema = STAGES.find(
      (s) => s.shape.kind.value === stage.kind && s.shape.format.value === stage.format,
    );
    if (!schema)
      return [
        {
          path: issue.path,
          message: `no stage has kind ${JSON.stringify(stage.kind)} and format ${JSON.stringify(stage.format)}; the kinds are ${KINDS}`,
        },
      ];
    const parsed = schema.safeParse(stage);
    return parsed.success
      ? [issue]
      : parsed.error.issues.map((own) => ({ ...own, path: [...issue.path, ...own.path] }));
  });

// An element with a child, so a step's undeclared prefix is resolved (and refused) while checking.
const xpathDocument = new DOMImplementation().createDocument(null, 'x');
xpathDocument.documentElement?.appendChild(xpathDocument.createElement('y'));
const xpathRoot = xpathDocument.documentElement;

// Field names and selectors the shape cannot check: every name a stage's `required` and `where` use is one of its
// fields, every CSS selector parses for the HTML reader, every XPath expression parses with the stage's namespaces.
const consistency = (artifact: Artifact) => {
  const names: string[] = [];
  const selectors: string[] = [];
  const css = (path: string, selector: string) => {
    try {
      validateLocator(selector);
    } catch (error) {
      selectors.push(
        `${path}: ${JSON.stringify(selector)} is not CSS the reader runs (${String((error as Error).message).replace(/^HTML_SELECTOR: /, '')})`,
      );
    }
  };
  const rule = (path: string, field: FieldRule) => {
    css(`${path}.selector`, field.selector);
    if (field.closest) css(`${path}.closest`, field.closest);
  };
  const { request, inputs, next } = artifact;
  if (next) {
    css('next.selector', next.selector);
    const first = artifact.stages[0];
    if (first?.format !== 'html')
      names.push('next: a next link is read from an HTML page, and the first stage is not HTML');
    if (request?.more !== undefined)
      names.push('next and request.more: an artifact reaches its next page one way');
  }
  if (request) {
    const inputNames = Object.keys(inputs ?? {});
    const startNames = Object.keys(request.start ?? {});
    const known = [...inputNames, ...startNames];
    for (const name of startNames)
      if (inputNames.includes(name))
        names.push(`request.start.${name}: ${JSON.stringify(name)} is also an input`);
    for (const { name, at } of templateNames(request))
      if (!known.includes(name))
        names.push(
          `${at}: "{${name}}" names no input and no start value; they are ${known.map((n) => JSON.stringify(n)).join(', ') || 'none'}`,
        );
    if (request.method === 'GET' && request.body)
      names.push('request.body: a GET request has no body');
    for (const [header, value] of Object.entries(request.headers ?? {}))
      if (/[\r\n]/.test(header + value)) names.push(`request.headers.${header}: a line break`);
  } else if (inputs && Object.keys(inputs).length)
    names.push('inputs: an artifact without a request has nothing to fill with them');
  artifact.stages.forEach((stage, index) => {
    const at = `stages.${index}`;
    if (stage.format === 'json') return;
    if ('namespaces' in stage) {
      const query = useNamespaces(stage.namespaces);
      for (const [path, expression] of [
        [`${at}.selector`, stage.selector],
        ...Object.entries(stage.fields).map(([name, e]) => [`${at}.fields.${name}`, e]),
      ] as [string, string][])
        try {
          query(expression, xpathRoot as unknown as globalThis.Node);
        } catch (error) {
          selectors.push(
            `${path}: ${JSON.stringify(expression)} is not XPath 1.0 with this stage's namespaces (${(error as Error).message})`,
          );
        }
    } else {
      css(`${at}.selector`, stage.selector);
      if (stage.kind === 'links') rule(`${at}.link`, stage.link);
      else
        for (const [name, field] of Object.entries(stage.fields))
          rule(`${at}.fields.${name}`, field);
      if (stage.resources) css(`${at}.resources.selector`, stage.resources.selector);
    }
    if (stage.kind !== 'records') return;
    const fields = Object.keys(stage.fields);
    const known = `this stage's fields are ${fields.map((f) => JSON.stringify(f)).join(', ') || 'none'}`;
    stage.required.forEach((name, i) => {
      if (!fields.includes(name))
        names.push(`${at}.required.${i}: ${JSON.stringify(name)} is not a field; ${known}`);
    });
    if (stage.where && stage.where.in !== 'text' && !fields.includes(stage.where.in))
      names.push(
        `${at}.where.in: ${JSON.stringify(stage.where.in)} is not a field or "text"; ${known}`,
      );
  });
  return { names, selectors };
};

// Checks an artifact once: rewritten to the current grammars, then its shape, its field names and selectors, its
// Prism programs and its output schema. Runs then need no model. Every problem of the first failing check is named.
export const prepareArtifact = (value: unknown): PreparedArtifact => {
  let upgraded: unknown;
  try {
    upgraded = upgradeArtifact(value);
  } catch (error) {
    throw new ArtifactError('UPGRADE', String((error as Error)?.message ?? error));
  }
  const parsed = ArtifactSchema.safeParse(upgraded);
  if (!parsed.success)
    throw new ArtifactError('GRAMMAR', describe(grammarIssues(upgraded, parsed.error.issues)));
  const artifact = parsed.data;
  const { names, selectors } = consistency(artifact);
  if (names.length) throw new ArtifactError('GRAMMAR', names.join('; '));
  if (selectors.length) throw new ArtifactError('SELECTOR', selectors.join('; '));
  const program = checkProgram(artifact.mapping);
  if (!program.ok) throw new ArtifactError('PROGRAM', `mapping: ${describe(program.issues)}`);
  const references = artifact.stages.map((stage, index) => {
    if (stage.kind !== 'references') return null;
    const checked = checkProgram(stage.references);
    if (!checked.ok)
      throw new ArtifactError('PROGRAM', `stages.${index}.references: ${describe(checked.issues)}`);
    return checked.data;
  });
  let more: Config | null = null;
  if (artifact.request?.more !== undefined) {
    const checked = checkProgram(artifact.request.more);
    if (!checked.ok) throw new ArtifactError('PROGRAM', `request.more: ${describe(checked.issues)}`);
    more = checked.data;
  }
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  formats.default(ajv);
  let validate: ReturnType<Ajv2020['compile']>;
  try {
    validate = ajv.compile(artifact.outputSchema);
  } catch (error) {
    throw new ArtifactError('OUTPUT_SCHEMA', String((error as Error)?.message ?? error));
  }
  const prepared: PreparedArtifact = {
    artifact,
    program: program.data,
    references,
    more,
    checkOutput: (data) => (validate(data) ? null : ajv.errorsText(validate.errors)),
    run: (input, options) => walk(prepared, input, options),
    inspect: async (input, options) => {
      const report: Report = { pages: [], records: null };
      try {
        const result = await walk(prepared, input, options, report);
        return { ...report, result, error: null };
      } catch (error) {
        const code = (error as { code?: unknown })?.code;
        return {
          ...report,
          result: null,
          error: {
            code: typeof code === 'string' ? code : null,
            message: String((error as Error)?.message ?? error),
          },
        };
      }
    },
  };
  return prepared;
};
