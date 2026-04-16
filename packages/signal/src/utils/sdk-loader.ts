import { SignalError, ErrorCode } from '../errors';

export const loadSdk = async (pkg: string): Promise<unknown> => {
  try {
    // The provider SDK to load is decided at runtime (whichever
    // adapter the user configured). Bundlers can't statically
    // analyse that, so opt out — the @vite-ignore hint silences
    // the warning, and bundlers that need the actual module bound
    // (Vite, esbuild, etc.) should pre-bundle it via their own
    // optimizeDeps / external configuration.
    const mod = await import(/* @vite-ignore */ pkg);
    return mod.default ?? mod;
  } catch {
    throw new SignalError(
      `Missing dependency: ${pkg}. Install it with: pnpm add ${pkg}`,
      ErrorCode.MISSING_SDK,
      { package: pkg },
    );
  }
};
