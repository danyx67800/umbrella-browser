import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBrowserContextMenu, type BrowserContextMenuItem } from './context-menu.ts';

const isActionItem = (item: BrowserContextMenuItem): item is Extract<BrowserContextMenuItem, { action: string }> =>
  'action' in item;
const actions = (context: Parameters<typeof buildBrowserContextMenu>[0]) =>
  buildBrowserContextMenu(context)
    .filter(isActionItem)
    .map((item) => item.action);

test('shows image and link actions together for a linked image', () => {
  const menu = buildBrowserContextMenu({
    canGoBack: true,
    canGoForward: false,
    hasImageContents: true,
    imageURL: 'https://example.com/photo.png',
    isEditable: false,
    linkURL: 'https://example.com/gallery',
    selectionText: ''
  });

  assert.deepEqual(actions({
    canGoBack: true,
    canGoForward: false,
    hasImageContents: true,
    imageURL: 'https://example.com/photo.png',
    isEditable: false,
    linkURL: 'https://example.com/gallery',
    selectionText: ''
  }), ['open-link', 'open-link-incognito', 'copy-link', 'save-link', 'open-image', 'save-image', 'copy-image', 'copy-image-address', 'inspect']);
  assert.ok(menu.find((item) => 'action' in item && item.action === 'copy-image'));
  assert.ok(menu.find((item) => 'action' in item && item.action === 'open-image'));
});

test('keeps copying an image available when it has no safe web URL', () => {
  assert.deepEqual(actions({
    canGoBack: false,
    canGoForward: false,
    hasImageContents: true,
    imageURL: null,
    isEditable: false,
    linkURL: null,
    selectionText: ''
  }), ['copy-image', 'inspect']);
});

test('shows page navigation, save, print, and inspect actions outside links and images', () => {
  const menu = buildBrowserContextMenu({
    canGoBack: true,
    canGoForward: false,
    hasImageContents: false,
    imageURL: null,
    isEditable: false,
    linkURL: null,
    selectionText: ''
  });

  assert.deepEqual(actions({
    canGoBack: true,
    canGoForward: false,
    hasImageContents: false,
    imageURL: null,
    isEditable: false,
    linkURL: null,
    selectionText: ''
  }), ['back', 'forward', 'reload', 'save-page', 'print', 'inspect']);
  const forwardItem = menu.find((item) => 'action' in item && item.action === 'forward');
  assert.equal(forwardItem && 'enabled' in forwardItem ? forwardItem.enabled : undefined, false);
});
