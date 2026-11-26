export const RELEASE_OWNER = 'perosss03-spec';
export const RELEASE_REPO = 'umbrella-browser';

/** Last path segment of a relative or absolute asset URL, without query or hash. */
export function assetFileName(value: string): string {
  const withoutQuery = value.split(/[?#]/)[0];
  const lastSegment = withoutQuery.slice(withoutQuery.lastIndexOf('/') + 1);
  try {
    return decodeURIComponent(lastSegment);
  } catch {
    return lastSegment;
  }
}

/**
 * Collapses the spelling differences GitHub releases tend to collect:
 * `Umbrella-Setup-0.4.4.exe`, `Umbrella.setup.0.4.4.exe` and
 * `Umbrella Setup 0.4.4.exe` all normalize to the same value.
 */
export function normalizeAssetName(value: string): string {
  return assetFileName(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function matchAssetName(expected: string, assets: string[]): string | null {
  const exact = assets.find((asset) => asset === expected);
  if (exact) return exact;

  const lowered = expected.toLowerCase();
  const caseInsensitive = assets.find((asset) => asset.toLowerCase() === lowered);
  if (caseInsensitive) return caseInsensitive;

  const target = normalizeAssetName(expected);
  if (!target) return null;
  return assets.find((asset) => normalizeAssetName(asset) === target) ?? null;
}

export function buildReleaseApiUrls(version: string, owner = RELEASE_OWNER, repo = RELEASE_REPO): string[] {
  const encodedVersion = encodeURIComponent(version);
  return [
    `https://api.github.com/repos/${owner}/${repo}/releases/tags/v${encodedVersion}`,
    `https://api.github.com/repos/${owner}/${repo}/releases/tags/${encodedVersion}`
  ];
}

export type UpdateInfoWithFiles = { files?: Array<{ url?: string }> };

/**
 * Points every file entry at the asset name that the release actually publishes.
 * electron-updater joins the entry with the release download URL, so a bare file
 * name is what it expects; absolute URLs keep working too.
 */
export function rewriteUpdateInfoAssets(info: UpdateInfoWithFiles, assets: string[]): string[] {
  const changes: string[] = [];
  for (const file of info.files ?? []) {
    if (typeof file.url !== 'string') continue;
    const match = matchAssetName(file.url, assets);
    if (!match || match === file.url) continue;
    changes.push(`${file.url} -> ${match}`);
    file.url = match;
  }
  return changes;
}
