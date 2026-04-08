import type { z } from 'zod';

// ═══════════════════════════════════════════════════════════
// Error codes
// ═══════════════════════════════════════════════════════════

export const ErrorCodes = {
  render: 'RENDER_ERROR',
  componentNotFound: 'COMPONENT_NOT_FOUND',
  layoutRefNotFound: 'LAYOUT_REF_NOT_FOUND',
  definitionValidation: 'DEFINITION_VALIDATION_ERROR',
  unknownAction: 'UNKNOWN_ACTION',
  shellDisposed: 'SHELL_DISPOSED',
  lifecycle: 'LIFECYCLE_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export type NovaErrorContext = Record<string, unknown>;

// ═══════════════════════════════════════════════════════════
// Base error — classes are permitted here because these are
// the only thrown error types; identity + instanceof are needed.
//
// Subclasses are added when there is a real throw site. Do not
// add dead exports.
// ═══════════════════════════════════════════════════════════

export class NovaError extends Error {
  readonly code: ErrorCode;
  readonly context: NovaErrorContext | undefined;

  constructor(
    code: ErrorCode,
    message: string,
    context?: NovaErrorContext,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'NovaError';
    this.code = code;
    this.context = context;
  }
}

export class RenderError extends NovaError {
  constructor(message: string, context?: NovaErrorContext, options?: { cause?: unknown }) {
    super(ErrorCodes.render, message, context, options);
    this.name = 'RenderError';
  }
}

export type ComponentNotFoundContext = NovaErrorContext & { name: string };

export class ComponentNotFoundError extends NovaError {
  constructor(
    message: string,
    context: ComponentNotFoundContext,
    options?: { cause?: unknown },
  ) {
    super(ErrorCodes.componentNotFound, message, context, options);
    this.name = 'ComponentNotFoundError';
  }
}

export type LayoutRefNotFoundContext = NovaErrorContext & { ref: string };

export class LayoutRefNotFoundError extends NovaError {
  constructor(
    message: string,
    context: LayoutRefNotFoundContext,
    options?: { cause?: unknown },
  ) {
    super(ErrorCodes.layoutRefNotFound, message, context, options);
    this.name = 'LayoutRefNotFoundError';
  }
}

export type DefinitionValidationFailure = {
  id: string;
  issues: z.core.$ZodIssue[];
};

export type DefinitionValidationContext = NovaErrorContext & {
  failures: DefinitionValidationFailure[];
};

export class DefinitionValidationError extends NovaError {
  constructor(
    message: string,
    context: DefinitionValidationContext,
    options?: { cause?: unknown },
  ) {
    super(ErrorCodes.definitionValidation, message, context, options);
    this.name = 'DefinitionValidationError';
  }
}

export type UnknownActionContext = NovaErrorContext & { actionId: string };

export class UnknownActionError extends NovaError {
  constructor(
    message: string,
    context: UnknownActionContext,
    options?: { cause?: unknown },
  ) {
    super(ErrorCodes.unknownAction, message, context, options);
    this.name = 'UnknownActionError';
  }
}

export class ShellDisposedError extends NovaError {
  constructor(message: string, context?: NovaErrorContext, options?: { cause?: unknown }) {
    super(ErrorCodes.shellDisposed, message, context, options);
    this.name = 'ShellDisposedError';
  }
}

export type LifecycleHook = 'mount' | 'unmount' | 'suspend' | 'resume';

export type LifecycleErrorContext = NovaErrorContext & {
  hook?: LifecycleHook;
  instanceId?: string;
};

export class LifecycleError extends NovaError {
  constructor(
    message: string,
    context?: LifecycleErrorContext,
    options?: { cause?: unknown },
  ) {
    super(ErrorCodes.lifecycle, message, context, options);
    this.name = 'LifecycleError';
  }
}
