import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBookmarkHtml } from './bookmarks.ts';

test('parses Chromium bookmark exports and decodes HTML entities', () => {
  const html = '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><DT><A HREF="https://example.com/?a=1&amp;b=2">Caf&#233; &amp; tea</A></DL>';

  assert.deepEqual(parseBookmarkHtml(html), [{
    title: 'Café & tea',
    url: 'https://example.com/?a=1&b=2'
  }]);
});

test('ignores anchors without an href and uses the URL when the title is empty', () => {
  const html = '<a>Folder label</a><a href="https://example.com"></a>';

  assert.deepEqual(parseBookmarkHtml(html), [{
    title: 'https://example.com',
    url: 'https://example.com'
  }]);
});
