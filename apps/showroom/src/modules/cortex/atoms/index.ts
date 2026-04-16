// Small presentational atoms used across cortex demos.
export { PROVIDER, DEFAULT_MODEL } from './constants';
export { stableJson, deepEqual } from './stable-json';
export { Section, type SectionVariant } from './section';
export { DemoBanner } from './demo-banner';
export { RunButton } from './run-button';
export { RetriesPanel, type RetryAttempt, type RetriesPanelOutcome } from './retries-panel';
export { PassFailBadge } from './pass-fail-badge';
export { ToolTimeline } from './tool-timeline';
export { TickTimeline } from './tick-timeline';
export { RuleTimeline, type RuleEvaluation } from './rule-timeline';
export { ConfirmationDialog, type ConfirmationRequest } from './confirmation-dialog';

// Session shapes — what an orchestrator passes to a demo's runner.
export type { Session, SessionWithBus, Runner, RunnerWithBus } from './session';

// Kind-level orchestrator components — own the React state machine
// + LLM construction. Each one accepts a `runner` from the demo
// file that performs the actual runAgentStandalone call.
export { StructuredExtractDemo } from './structured-extract';
export { PrismMappingDemo } from './prism-mapping';
export { ToolUseDemo } from './tool-use';
export { PlanModeDemo } from './plan-mode';
export { RulesDemo } from './rules';
export { ConfirmationDemo } from './confirmation';
