import type { FetchFn, Shell } from '@niscorp/nova';
import type { FunctionSession } from '@niscorp/moss';

// What ray asks of the session it runs in: the shell it drives, a wire and an
// intent writer that run as the caller, and the caller's own draft and saves.
export type RayContext = {
  shell: Shell;
  userId: string;
  wire: FetchFn;
  answerIntent: (asked: { intent: string; shape: unknown; context?: Record<string, unknown> }) => ReturnType<FunctionSession['answerIntent']>;
  draft: FunctionSession['draft'];
  artifacts: FunctionSession['artifacts'];
};
