import type { ShellManifest } from '@niscorp/moss';

// THE PHONE'S LIST for one person, as boot data (`inputs`): the actions they
// hold that belong on a phone, in the phone's order — derived when their shell
// is built; a grant that changes (the X-ray given) or an integration approved
// rebuilds the shell, and the list with it. Ring 1 decides; this only reads it.
//
//   the assistant            everybody who joined
//   ext.member.*             every integration installed and approved for
//                            members (Acme's Q&A), in the order they came
//   the X-ray                once the speaker gave it
const ON_THE_PHONE: readonly ((actions: readonly string[]) => readonly string[])[] = [
  (actions) => actions.filter((action) => action === 'assistant.thread'),
  (actions) => actions.filter((action) => action.startsWith('ext.member.')),
  (actions) => actions.filter((action) => action === 'xray.switch'),
];

export const phoneInputs: NonNullable<ShellManifest['inputs']> = ({ actions }): Record<string, Record<string, unknown>> => {
  if (!actions.includes('member.phone')) return {};
  return { main: { stack: ON_THE_PHONE.flatMap((pick) => pick(actions)).map((action) => ({ action })) } };
};
