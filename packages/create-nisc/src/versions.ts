// The versions a new app depends on: the set @niscorp/nisc was released with.
//
// That package exists to say which versions of every @niscorp package belong
// together — its dependencies pin each one exactly — so a new app asks it,
// rather than taking whatever is newest of each and hoping they agree.

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

export const releasedSet = async (registry: string): Promise<Record<string, string>> => {
  const url = `${registry.replace(/\/$/, '')}/@niscorp%2fnisc/latest`;
  let response: Response;
  try {
    response = await fetch(url, { headers: { accept: 'application/json' } });
  } catch (error) {
    throw new Error(`create-nisc: could not reach ${registry} to ask which nisc release is current (${error instanceof Error ? error.message : String(error)})`);
  }
  if (!response.ok) throw new Error(`create-nisc: ${url} answered ${response.status}`);
  const manifest: unknown = await response.json();
  if (!isRecord(manifest) || typeof manifest['version'] !== 'string' || !isRecord(manifest['dependencies'])) {
    throw new Error(`create-nisc: ${url} is not a package manifest`);
  }
  const set: Record<string, string> = { '@niscorp/nisc': manifest['version'] };
  for (const [name, version] of Object.entries(manifest['dependencies'])) {
    if (typeof version === 'string') set[name] = version.replace(/^[\^~=]/, '');
  }
  return set;
};
