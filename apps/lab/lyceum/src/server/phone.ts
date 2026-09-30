import type { ShellManifest } from '@niscorp/moss';
import { PHONE_BUTTONS } from '@lyceum/app/actions/member/phone.action';

// THE PHONE for one person, as boot data (`inputs`), derived when the shell is
// built; a grant that changes — the X-ray given, an integration approved —
// rebuilds the shell, and this with it. Ring 1 decides; this only reads it.
//
//   bar    at most TWO things: the X-ray's switch first when it was given,
//          then the buttons whose action the person is granted, in
//          PHONE_BUTTONS order — whatever does not fit is not on the bar.
//   stack  the list in the middle: the ID card, then every integration screen
//          the person is granted (`ext.member.*`), slotted in as it is
//          installed.
const BAR_LIMIT = 2;

export const phoneInputs: NonNullable<ShellManifest['inputs']> = ({ actions }): Record<string, Record<string, unknown>> => {
  if (!actions.includes('member.phone')) return {};
  const switches = actions.includes('xray.document') ? [{ kind: 'xray' }] : [];
  const buttons = PHONE_BUTTONS.filter((button) => actions.includes(button.action)).map((button) => ({ ...button, on: false }));
  const tabs = buttons.slice(0, Math.max(0, BAR_LIMIT - switches.length));
  const placed = [...switches, ...tabs].map((_, index) => `tab-${index}`);
  const stack = [{ action: 'member.card' }, ...actions.filter((action) => action.startsWith('ext.member.')).map((action) => ({ action }))];
  return {
    main: {
      stack,
      bar: {
        areas: [placed.join(' ')],
        switches: switches.map((_, index) => ({ area: placed[index] })),
        tabs: tabs.map((tab, index) => ({ ...tab, area: placed[switches.length + index] })),
      },
    },
  };
};
