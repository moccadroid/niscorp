import type { ShellManifest } from '@niscorp/moss';
import type { Integrations } from '@niscorp/moss/integrations';
import type { Seats } from '@lyceum/app/attachable';
import { attachedTo } from './attached';

export const PHONE = 'member.phone';

// What is on a phone's list, in order, of what the person holds.
export const phoneList = async (integrations: Integrations<Seats>, held: readonly string[]): Promise<string[]> => {
  const of = (id: string): string[] => (held.includes(id) ? [id] : []);
  return [
    // The framework bar, then the Q&A: your question is up, and the form to ask one.
    ...of('screens.look'),
    ...of('questions.up'),
    ...of('questions.send'),
    ...of('assistant.thread'),
    ...of('ask.records'),
    ...(await attachedTo(integrations, PHONE, held)),
    ...of('button.press'),
    ...of('xray.switch'),
  ];
};

export const phoneInputs = (integrations: Integrations<Seats>): NonNullable<ShellManifest['inputs']> => async ({ actions }): Promise<Record<string, Record<string, unknown>>> => {
  if (!actions.includes(PHONE)) return {};
  return { main: { stack: (await phoneList(integrations, actions)).map((action) => ({ action })) } };
};
