export type BrowserTheme = 'dark' | 'light' | 'system';

function duckDuckGoUrl(query: string | null, theme: BrowserTheme) {
  const url = new URL('https://duckduckgo.com/');
  if (query) url.searchParams.set('q', query);
  if (theme === 'dark') url.searchParams.set('kae', 'd');
  else if (theme === 'light') url.searchParams.set('kae', 'l');
  return url.toString();
}

export function resolveNavigation(input: string, theme: BrowserTheme = 'system'): string {
  const value = input.trim();
  if (!value) return duckDuckGoUrl(null, theme);

  // A host-like value is treated as a direct URL; everything else is a search.
  const hasWhitespace = /\s/.test(value);
  const looksLikeHost = /^(?:localhost|(?:\d{1,3}\.){3}\d{1,3}|(?:[\w-]+\.)+[a-z]{2,})(?::\d+)?(?:[\/?#].*)?$/i.test(value)
    || /^\[[0-9a-f:]+\](?::\d+)?(?:[\/?#].*)?$/i.test(value)
    || /^https?:\/\//i.test(value);

  if (!hasWhitespace && looksLikeHost) {
    const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    try {
      const url = new URL(candidate);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        if (url.hostname === 'duckduckgo.com') applyDuckDuckGoTheme(url, theme);
        return url.toString();
      }
    } catch { /* fall through to a DuckDuckGo search */ }
  }

  return duckDuckGoUrl(value, theme);
}

function applyDuckDuckGoTheme(url: URL, theme: BrowserTheme) {
  if (theme === 'dark') url.searchParams.set('kae', 'd');
  else if (theme === 'light') url.searchParams.set('kae', 'l');
}

export function isSafeWebUrl(raw: string) {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch { return false; }
}
