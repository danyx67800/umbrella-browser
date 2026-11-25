export type ImportedBookmark = { title: string; url: string };

function decodeHtmlEntities(value: string) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity: string) => {
    const normalized = entity.toLowerCase();
    const namedEntities: Record<string, string> = {
      amp: '&',
      lt: '<',
      gt: '>',
      quot: '"',
      apos: "'"
    };
    if (normalized in namedEntities) return namedEntities[normalized];

    const codePoint = normalized.startsWith('#x')
      ? Number.parseInt(normalized.slice(2), 16)
      : Number.parseInt(normalized.slice(1), 10);
    if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return '\uFFFD';
    return String.fromCodePoint(codePoint);
  });
}

export function parseBookmarkHtml(html: string): ImportedBookmark[] {
  const bookmarks: ImportedBookmark[] = [];
  const anchors = html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi);

  for (const [, attributes, rawTitle] of anchors) {
    const hrefMatch = attributes.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i);
    const url = decodeHtmlEntities(hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3] ?? '').trim();
    if (!url) continue;

    const title = decodeHtmlEntities(rawTitle.replace(/<[^>]*>/g, '')).trim() || url;
    bookmarks.push({ title, url });
  }

  return bookmarks;
}
