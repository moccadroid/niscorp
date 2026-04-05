import { SignalError, ErrorCode } from '../errors';

export const loadSdk = async (pkg: string): Promise<unknown> => {
  try {
    const mod = await import(pkg);
    return mod.default ?? mod;
  } catch {
    throw new SignalError(
      `Missing dependency: ${pkg}. Install it with: pnpm add ${pkg}`,
      ErrorCode.MISSING_SDK,
      { package: pkg },
    );
  }
};
