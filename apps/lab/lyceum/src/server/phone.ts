import type { ShellManifest } from '@niscorp/moss';
import type { Integrations } from '@niscorp/moss/integrations';
import type { Seats } from '@lyceum/app/attachable';
import { attachedTo } from './attached';

export const phoneInputs = (integrations: Integrations<Seats>): NonNullable<ShellManifest['inputs']> => async ({ actions }): Promise<Record<string, Record<string, unknown>>> => {
  if (!actions.includes('member.phone')) return {};
  const onThePhone = [
    ...actions.filter((action) => action === 'assistant.thread'),
    ...(await attachedTo(integrations, 'member.phone', actions)),
    ...actions.filter((action) => action === 'button.press'),
    ...actions.filter((action) => action === 'xray.switch'),
  ];
  return { main: { stack: onThePhone.map((action) => ({ action })) } };
};
