export function resolveNavigation(input: string): string {
  const value = input.trim();
  if (!value) return 'https://duckduckgo.com/';

  // A host-like value is treated as a direct URL; everything else is a search.
  const hasWhitespace = /\s/.test(value);
  const looksLikeHost = /^(?:localhost|(?:\d{1,3}\.){3}\d{1,3}|(?:[\w-]+\.)+[a-z]{2,})(?::\d+)?(?:[\/?#].*)?$/i.test(value)
    || /^\[[0-9a-f:]+\](?::\d+)?(?:[\/?#].*)?$/i.test(value)
    || /^https?:\/\//i.test(value);

  if (!hasWhitespace && looksLikeHost) {
    const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    try {
      const url = new URL(candidate);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString();
    } catch { /* fall through to a DuckDuckGo search */ }
  }

  const query = new URLSearchParams({ q: value });
  return `https://duckduckgo.com/?${query.toString()}`;
}

export function isSafeWebUrl(raw: string) {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch { return false; }
}
