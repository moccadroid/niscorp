import type { ShellManifest } from '@niscorp/moss';
import type { PgPool } from '@niscorp/vex';
import { attachedTo } from './attached';

// THE PHONE'S LIST for one person, as boot data (`inputs`): the actions they
// hold that belong on a phone, in the phone's order — derived when their shell
// is built; a grant that changes (the X-ray given) or an integration approved
// rebuilds the shell, and the list with it. Ring 1 decides; this only reads it.
//
//   the assistant            everybody who joined
//   attached to the phone    every integration screen installed, approved and
//                            attached to `member.phone` (Acme's Q&A)
//   the X-ray                once the speaker gave it
export const phoneInputs = (pool: PgPool): NonNullable<ShellManifest['inputs']> => async ({ actions }): Promise<Record<string, Record<string, unknown>>> => {
  if (!actions.includes('member.phone')) return {};
  const onThePhone = [
    ...actions.filter((action) => action === 'assistant.thread'),
    ...(await attachedTo(pool, 'member.phone', actions)),
    ...actions.filter((action) => action === 'xray.switch'),
  ];
  return { main: { stack: onThePhone.map((action) => ({ action })) } };
};
