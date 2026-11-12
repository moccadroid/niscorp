import { Ajv2020 } from 'ajv/dist/2020.js';
import formats from 'ajv-formats';
import { validate as checkProgram, type Config } from '@niscorp/prism';
import { upgradeArtifact } from './grammar.js';
import { ArtifactSchema, type Artifact } from './schema.js';
import { walk, type WalkOptions, type WalkResult } from './walk.js';

export class ArtifactError extends Error {
  constructor(
    readonly code: 'UPGRADE' | 'GRAMMAR' | 'PROGRAM' | 'OUTPUT_SCHEMA',
    message: string,
  ) {
    super(message);
  }
}

export type PreparedArtifact = {
  artifact: Artifact;
  program: Config;
  // Each stage's checked reference program, by stage position; null for stages without one.
  references: (Config | null)[];
  // null when the data fits the output schema; otherwise what is wrong.
  checkOutput(data: unknown): string | null;
  // One run with no model: current data from the page at this address.
  run(input: { url: string }, options: WalkOptions): Promise<WalkResult>;
};

const describe = (issues: { path: readonly PropertyKey[]; message: string }[]) =>
  issues.map((issue) => `${issue.path.map(String).join('.') || '$'}: ${issue.message}`).join('; ');

// Checks an artifact once: rewritten to the current grammars, then its shape, its Prism programs and its output
// schema. Runs then need no model.
export const prepareArtifact = (value: unknown): PreparedArtifact => {
  let upgraded: unknown;
  try {
    upgraded = upgradeArtifact(value);
  } catch (error) {
    throw new ArtifactError('UPGRADE', String((error as Error)?.message ?? error));
  }
  const parsed = ArtifactSchema.safeParse(upgraded);
  if (!parsed.success) throw new ArtifactError('GRAMMAR', describe(parsed.error.issues));
  const artifact = parsed.data;
  const program = checkProgram(artifact.mapping);
  if (!program.ok) throw new ArtifactError('PROGRAM', describe(program.issues));
  const references = artifact.stages.map((stage, index) => {
    if (stage.kind !== 'references') return null;
    const checked = checkProgram(stage.references);
    if (!checked.ok)
      throw new ArtifactError('PROGRAM', `stages.${index}.references: ${describe(checked.issues)}`);
    return checked.data;
  });
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
    checkOutput: (data) => (validate(data) ? null : ajv.errorsText(validate.errors)),
    run: (input, options) => walk(prepared, input.url, options),
  };
  return prepared;
};
