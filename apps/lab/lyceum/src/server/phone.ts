import type { ShellManifest } from '@niscorp/moss';
import { PHONE_BUTTONS } from '@lyceum/app/actions/member/phone.action';

// THE PHONE'S BAR for one person: the authored buttons whose action they are
// granted — ring 1 decides, this only reads it — each given a place in a
// one-row grid. Boot data for the phone (`inputs`), derived when the shell is
// built; a grant that changes rebuilds the shell, and the bar with it.
export const phoneInputs: NonNullable<ShellManifest['inputs']> = ({ actions }): Record<string, Record<string, unknown>> => {
  if (!actions.includes('member.phone')) return {};
  const tabs = PHONE_BUTTONS.filter((button) => actions.includes(button.action)).map((button, index) => ({ ...button, area: `tab-${index}` }));
  // The X-ray, when it was given: a switch after the tabs.
  const switches = actions.includes('xray.document') ? [{ area: `tab-${tabs.length}` }] : [];
  const areas = [...tabs, ...switches].map((place) => place.area).join(' ');
  return { main: { bar: { areas: [areas], tabs, switches } } };
};
