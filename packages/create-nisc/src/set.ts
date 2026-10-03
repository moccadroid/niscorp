// The versions a new app depends on: the nisc release its template was checked
// against — written into this package when it is built (tsup.config.ts reads
// them off the workspace), never looked up.
//
// "Whatever is newest on npm" would be a set nobody tested the templates with.
// This is the set the repository's CI built, typechecked and checked every
// template against, at the commit this package was built from; create-nisc is
// versioned in lockstep with @niscorp/nisc, so the newest create-nisc carries
// the newest set. It also means making an app needs no network.
declare const __NISC_SET__: Readonly<Record<string, string>> | undefined;

export const testedSet = (): Readonly<Record<string, string>> => {
  if (typeof __NISC_SET__ === 'undefined') throw new Error('create-nisc: this copy was not built — it carries no nisc release to pin a new app to');
  return __NISC_SET__;
};
