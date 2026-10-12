import { describe, expect, it } from 'vitest';
import { devPluginOptionsOf } from '../src/dev';

describe('nisc dev — what the config’s `dev` block tells the dev plugin', () => {
  it('hands on the paths the app server owns, what re-boots it, and sign-in from the network', () => {
    const watch = /[\\/]src[\\/]integrations[\\/]/;
    const owned = /^\/(api|catalog|socket|operator|integrations|webhooks)(\/|$)/;
    expect(devPluginOptionsOf({ watch, owned, signInFromNetwork: true })).toEqual({ watch, owned, signInFromNetwork: true });
  });

  it('names nothing the config did not, so the plugin’s own defaults hold', () => {
    expect(devPluginOptionsOf(undefined)).toEqual({});
    expect(devPluginOptionsOf({ signIn: () => null })).toEqual({});
  });
});
