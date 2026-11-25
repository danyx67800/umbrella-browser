import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveNavigation } from './navigation.ts';

test('applies the selected light or dark theme to DuckDuckGo searches', () => {
  assert.equal(new URL(resolveNavigation('privacy browser', 'dark')).searchParams.get('kae'), 'd');
  assert.equal(new URL(resolveNavigation('privacy browser', 'light')).searchParams.get('kae'), 'l');
});

test('leaves DuckDuckGo on automatic appearance for the system theme', () => {
  assert.equal(new URL(resolveNavigation('privacy browser', 'system')).searchParams.has('kae'), false);
});

test('does not rewrite unrelated direct URLs', () => {
  assert.equal(resolveNavigation('https://example.com/path', 'dark'), 'https://example.com/path');
});
