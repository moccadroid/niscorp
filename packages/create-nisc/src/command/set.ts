// Written in when this package is built (tsup.config.ts), never looked up:
// "whatever is newest on npm" would be a set nobody tested the templates with.
declare const __NISC_SET__: Readonly<Record<string, string>> | undefined;

export const testedSet = (): Readonly<Record<string, string>> => {
  if (typeof __NISC_SET__ === 'undefined') throw new Error('create-nisc: this copy was not built — it carries no nisc release to pin a new app to');
  return __NISC_SET__;
};
