export type ArtifactErrorCode =
  | 'INVALID_JSON'
  | 'JSON_LIMIT'
  | 'INVALID_SCHEMA'
  | 'INVALID_FLOW'
  | 'INVALID_EXPRESSION'
  | 'INVALID_VALUE';
export class ArtifactError extends Error {
  constructor(
    readonly code: ArtifactErrorCode,
    message: string,
    readonly path: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ArtifactError';
  }
}
